<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a sale may price an item below what it cost the shop.
 *
 * Defaults to false, so selling at a loss is blocked unless a shop turns it
 * on. A switch rather than a fixed rule, because clearing old stock below
 * cost is a legitimate decision an owner can make on purpose.
 *
 * Only items with a purchase price above zero are ever checked: an item with
 * no cost recorded has nothing to fall below.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('order_settings') && !Schema::hasColumn('order_settings', 'allow_sale_below_cost')) {
            Schema::table('order_settings', function (Blueprint $table) {
                $table->boolean('allow_sale_below_cost')->default(false)->after('allow_order_discount');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('order_settings') && Schema::hasColumn('order_settings', 'allow_sale_below_cost')) {
            Schema::table('order_settings', function (Blueprint $table) {
                $table->dropColumn('allow_sale_below_cost');
            });
        }
    }
};
