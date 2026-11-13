<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('items')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'barcode')) {
                // The scannable code printed on the item's price/shelf label
                // and read at POS Checkout. Deliberately NOT uniquely indexed
                // here: an item carries one row per branch (same item_number,
                // different location), and every branch's copy of the same
                // physical product must share the same barcode. Uniqueness is
                // therefore enforced per distinct item_number in BarcodeService
                // rather than by the database.
                $table->string('barcode', 64)->nullable()->after('sku');
            }

            if (!Schema::hasColumn('items', 'barcode_type')) {
                // Symbology the label is rendered in. CODE128 is the default
                // because it encodes any length and needs no company prefix
                // registration; EAN13 is offered for shops that already use
                // retail-standard codes.
                $table->string('barcode_type', 20)->default('CODE128')->after('barcode');
            }

            if (!Schema::hasColumn('items', 'auto_generate_barcode')) {
                // When true the system assigns the barcode on create, the same
                // way item_number is auto-assigned. Turned off when the shop
                // types in a manufacturer's existing barcode.
                $table->boolean('auto_generate_barcode')->default(true)->after('barcode_type');
            }
        });

        Schema::table('items', function (Blueprint $table) {
            // Scanning at the till looks items up by this column on every
            // scan, so it needs an index to stay fast as the catalog grows.
            if (Schema::hasColumn('items', 'barcode')) {
                $table->index(['company_id', 'barcode'], 'items_company_barcode_index');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('items')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            if (Schema::hasColumn('items', 'barcode')) {
                $table->dropIndex('items_company_barcode_index');
            }
        });

        Schema::table('items', function (Blueprint $table) {
            foreach (['auto_generate_barcode', 'barcode_type', 'barcode'] as $column) {
                if (Schema::hasColumn('items', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
