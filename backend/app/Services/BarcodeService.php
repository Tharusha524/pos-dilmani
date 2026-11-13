<?php

namespace App\Services;

use App\Models\Item;

/**
 * Generates and validates the scannable barcodes printed on item labels.
 *
 * Codes are 13 digits: a 2-digit internal prefix, a 4-digit company segment,
 * a 6-digit per-company sequence, and a mod-10 check digit. They are rendered
 * as CODE128 by default, but keeping them numeric and 13 wide means the same
 * stored value can be re-rendered as EAN-13 later without reprinting labels or
 * migrating data.
 *
 * The check digit exists so a mis-typed code (a cashier entering a damaged
 * label by hand) is rejected outright instead of silently resolving to a
 * different product.
 */
class BarcodeService
{
    /** Marks a code as generated in-house, not issued by a manufacturer. */
    public const INTERNAL_PREFIX = '20';

    public const TYPE_CODE128 = 'CODE128';

    public const TYPE_EAN13 = 'EAN13';

    public const SUPPORTED_TYPES = [self::TYPE_CODE128, self::TYPE_EAN13];

    /**
     * Strip the whitespace and separators a scanner or a human can introduce.
     * A handheld scanner appends a newline/tab as its "enter" key, and typed
     * codes often arrive with spaces or dashes copied from a label.
     */
    public function normalize(?string $code): string
    {
        return preg_replace('/[^A-Za-z0-9._-]/', '', trim((string) $code)) ?? '';
    }

    public function normalizeType(?string $type): string
    {
        $upper = strtoupper(trim((string) $type));

        return in_array($upper, self::SUPPORTED_TYPES, true) ? $upper : self::TYPE_CODE128;
    }

    /**
     * Next unused internal barcode for this company.
     *
     * The sequence continues from the highest internally-generated code the
     * company already has, so it survives item deletions without reissuing a
     * code that is still printed on stock sitting in the shop. Manufacturer
     * barcodes are ignored when reading the high-water mark because they
     * follow someone else's numbering.
     */
    public function generateForCompany(int $companyId): string
    {
        $prefix = self::INTERNAL_PREFIX.$this->companySegment($companyId);

        $highest = Item::where('company_id', $companyId)
            ->whereNotNull('barcode')
            ->where('barcode', 'like', $prefix.'%')
            ->selectRaw('MAX(barcode) as max_barcode')
            ->value('max_barcode');

        $sequence = 0;
        if (is_string($highest) && strlen($highest) === 13) {
            // Drop the 6 prefix digits and the trailing check digit.
            $sequence = (int) substr($highest, 6, 6);
        }

        // Walk forward rather than trusting the high-water mark blindly: a
        // manually entered code could already occupy the next slot.
        for ($attempt = 0; $attempt < 1_000_000; $attempt++) {
            $sequence++;
            if ($sequence > 999999) {
                break;
            }

            $candidate = $this->withCheckDigit($prefix.str_pad((string) $sequence, 6, '0', STR_PAD_LEFT));

            if (!$this->existsForCompany($companyId, $candidate)) {
                return $candidate;
            }
        }

        throw new \RuntimeException('Barcode sequence exhausted for this company. Enter a barcode manually.');
    }

    /**
     * True when the code is already carried by an item that is NOT the same
     * product as $itemNumber.
     *
     * An item has one row per branch sharing a single item_number, and all of
     * those rows legitimately carry the same barcode — so matching rows of the
     * same item_number are not a clash. Any other item_number holding this
     * code is, because scanning it at the till would be ambiguous.
     */
    public function isTakenByAnotherItem(int $companyId, string $barcode, ?string $itemNumber = null): bool
    {
        $barcode = $this->normalize($barcode);
        if ($barcode === '') {
            return false;
        }

        $query = Item::where('company_id', $companyId)->where('barcode', $barcode);

        if ($itemNumber !== null && $itemNumber !== '') {
            $query->where('item_number', '!=', $itemNumber);
        }

        return $query->exists();
    }

    /**
     * Reject codes that cannot be printed or scanned reliably before they
     * reach the label queue. EAN-13 is checked strictly (13 digits, valid
     * check digit) because a bad one renders as a blank label rather than
     * failing loudly at print time.
     */
    public function validateForType(string $barcode, string $type): ?string
    {
        $barcode = $this->normalize($barcode);
        $type = $this->normalizeType($type);

        if ($barcode === '') {
            return null;
        }

        if (strlen($barcode) > 64) {
            return 'Barcode cannot be longer than 64 characters.';
        }

        if ($type === self::TYPE_EAN13) {
            if (!preg_match('/^\d{13}$/', $barcode)) {
                return 'An EAN-13 barcode must be exactly 13 digits.';
            }

            if (!$this->hasValidCheckDigit($barcode)) {
                return 'That EAN-13 barcode has an invalid check digit.';
            }
        }

        return null;
    }

    /** Append the mod-10 check digit to a 12-digit body. */
    public function withCheckDigit(string $body): string
    {
        return $body.$this->checkDigit($body);
    }

    public function hasValidCheckDigit(string $barcode): bool
    {
        if (!preg_match('/^\d{13}$/', $barcode)) {
            return false;
        }

        return (string) $this->checkDigit(substr($barcode, 0, 12)) === substr($barcode, 12, 1);
    }

    /**
     * Standard GS1 mod-10: digits are weighted 1 and 3 alternately from the
     * left across a 12-digit body, and the check digit brings the weighted
     * sum up to the next multiple of ten.
     */
    public function checkDigit(string $body): int
    {
        $sum = 0;
        $length = strlen($body);

        for ($i = 0; $i < $length; $i++) {
            $digit = (int) $body[$i];
            $sum += ($i % 2 === 0) ? $digit : $digit * 3;
        }

        return (10 - ($sum % 10)) % 10;
    }

    private function existsForCompany(int $companyId, string $barcode): bool
    {
        return Item::where('company_id', $companyId)->where('barcode', $barcode)->exists();
    }

    /** Keeps each company's codes in their own number space. */
    private function companySegment(int $companyId): string
    {
        return str_pad((string) ($companyId % 10000), 4, '0', STR_PAD_LEFT);
    }
}
