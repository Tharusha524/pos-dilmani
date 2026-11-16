<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guard a barcode that is already in use.
 *
 * Once labels are printed, replacing an item's barcode silently invalidates
 * every sticker already on a shelf: the till reports "no item found" and the
 * stock has to be re-labelled by hand. Nothing stopped that happening, so a
 * PIN now stands between a saved barcode and a change to it. The admin sets
 * the PIN and hands it only to staff who should be able to re-issue codes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_settings', function (Blueprint $table) {
            $table->boolean('require_barcode_change_pin')->default(true)
                ->after('allow_total_price_entry_on_sales_screen');
            $table->string('barcode_change_pin', 20)->nullable()
                ->after('require_barcode_change_pin');
        });
    }

    public function down(): void
    {
        Schema::table('item_settings', function (Blueprint $table) {
            $table->dropColumn(['require_barcode_change_pin', 'barcode_change_pin']);
        });
    }
};
