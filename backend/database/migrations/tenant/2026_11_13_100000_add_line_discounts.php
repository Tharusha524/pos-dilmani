<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-line discounts on sales, and the unit for an item's discount ceiling.
 *
 * Until now an item's "default discount" and "max discount" were stored but
 * never read when pricing a sale, so a discount set on an item was silently
 * ignored at the till. These columns let a sale line carry its own discount.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('items') && !Schema::hasColumn('items', 'max_discount_type')) {
            Schema::table('items', function (Blueprint $table) {
                // The item form always offered % / Rs for the maximum discount,
                // but the choice was held only in the page's memory and lost on
                // save — so "max Rs 500" came back as "max 500%". Defaults to
                // percent, which is what every existing row has been read as.
                $table->string('max_discount_type', 10)->default('percent')->after('max_discount');
            });
        }

        if (!Schema::hasTable('sale_items')) {
            return;
        }

        Schema::table('sale_items', function (Blueprint $table) {
            if (!Schema::hasColumn('sale_items', 'discount_type')) {
                // 'percent' or 'amount'. Amount is per unit, because the value
                // usually comes from the item, where "Rs 50 off" means per shirt.
                $table->string('discount_type', 10)->nullable()->after('line_total');
            }

            if (!Schema::hasColumn('sale_items', 'discount_value')) {
                // What the cashier entered (10 for 10%, or 50 for Rs 50/unit),
                // kept so the line reads back as it was keyed in.
                $table->decimal('discount_value', 15, 2)->default(0)->after('discount_type');
            }

            if (!Schema::hasColumn('sale_items', 'discount_amount')) {
                // The money actually taken off this line. Stored, not derived,
                // so a later change to the item's discount never rewrites the
                // value of a sale that has already happened.
                $table->decimal('discount_amount', 15, 2)->default(0)->after('discount_value');
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('sale_items')) {
            Schema::table('sale_items', function (Blueprint $table) {
                foreach (['discount_amount', 'discount_value', 'discount_type'] as $column) {
                    if (Schema::hasColumn('sale_items', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (Schema::hasTable('items') && Schema::hasColumn('items', 'max_discount_type')) {
            Schema::table('items', function (Blueprint $table) {
                $table->dropColumn('max_discount_type');
            });
        }
    }
};
