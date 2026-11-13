<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\ItemService;
use Illuminate\Console\Command;

/**
 * Issues barcodes to items created before barcodes existed, so a shop with an
 * established catalog can start printing labels without opening every item.
 *
 * Items that already carry a barcode are left alone — including manufacturer
 * codes typed in by hand — because a reissued code would not match the labels
 * already stuck on stock sitting in the shop.
 */
class BackfillItemBarcodes extends Command
{
    protected $signature = 'items:backfill-barcodes
        {--company= : Limit to a single company id}
        {--dry-run : Report what would change without writing anything}';

    protected $description = 'Assign barcodes to items that do not have one yet';

    public function handle(ItemService $itemService): int
    {
        $companyId = $this->option('company');
        $dryRun = (bool) $this->option('dry-run');

        $companies = Company::query()
            ->when($companyId, fn ($q) => $q->where('id', (int) $companyId))
            ->orderBy('id')
            ->get();

        if ($companies->isEmpty()) {
            $this->warn('No companies found.');

            return self::SUCCESS;
        }

        $totalAssigned = 0;

        foreach ($companies as $company) {
            if ($dryRun) {
                $pending = \App\Models\Item::where('company_id', $company->id)
                    ->where(function ($q) {
                        $q->whereNull('barcode')->orWhere('barcode', '');
                    })
                    ->distinct()
                    ->count('item_number');

                $this->line("Company {$company->id}: {$pending} product(s) would be assigned a barcode.");
                continue;
            }

            $result = $itemService->backfillBarcodesForCompany((int) $company->id);
            $totalAssigned += $result['assigned'];

            $this->info(
                "Company {$company->id}: assigned {$result['assigned']} row(s), ".
                "skipped {$result['skipped']} row(s) that already had a barcode."
            );
        }

        if (!$dryRun) {
            $this->info("Done. {$totalAssigned} item row(s) updated.");
        }

        return self::SUCCESS;
    }
}
