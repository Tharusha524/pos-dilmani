<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customisation for the printed sales receipt.
 *
 * Kept in its own table rather than added to hardware_settings because the two
 * answer different questions: hardware_settings describes the equipment (paper
 * size, which printer, letterhead margins), while this describes the document
 * (what appears on it, what each line is called, how big it is). Mixing them
 * would make the receipt editor and the hardware page fight over one row.
 *
 * Scoped per user, matching hardware_settings, so a shop can give the counter
 * terminal and the back office different receipt layouts.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('receipt_settings')) {
            return;
        }

        Schema::create('receipt_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // --- Header ---
            $table->boolean('show_logo')->default(true);
            $table->boolean('show_shop_name')->default(true);
            $table->boolean('show_address')->default(true);
            $table->boolean('show_phone')->default(true);
            $table->boolean('show_email')->default(false);
            $table->boolean('show_tax_id')->default(false);

            // --- Invoice info ---
            $table->boolean('show_invoice_id')->default(true);
            $table->boolean('show_date_time')->default(true);
            $table->boolean('show_cashier')->default(true);
            $table->boolean('show_branch_name')->default(true);
            $table->boolean('show_customer_name')->default(true);

            // --- Items table ---
            $table->boolean('show_item_number')->default(true);
            $table->boolean('show_item_uom')->default(true);
            $table->boolean('show_unit_price')->default(true);
            $table->boolean('show_discount_column')->default(true);

            // --- Totals and payment ---
            $table->boolean('show_payment_method')->default(true);
            $table->boolean('show_amount_received')->default(true);
            $table->boolean('show_change')->default(true);
            $table->boolean('show_you_saved')->default(false);

            // --- Footer ---
            $table->boolean('show_thank_you')->default(true);
            $table->string('thank_you_message')->default('Thank you for your business');
            $table->boolean('show_footer_note')->default(false);
            $table->text('footer_note')->nullable();
            $table->boolean('show_barcode')->default(true);

            // --- Editable labels ---
            // Every caption on the receipt is editable so a shop can print in
            // its own wording (or language) without a code change.
            $table->json('labels')->nullable();

            // --- Type sizes, in px, applied per section ---
            $table->unsignedSmallInteger('font_header')->default(14);
            $table->unsignedSmallInteger('font_invoice_info')->default(11);
            $table->unsignedSmallInteger('font_items')->default(11);
            $table->unsignedSmallInteger('font_totals')->default(12);
            $table->unsignedSmallInteger('font_footer')->default(10);

            // --- Receipt length ---
            // Gap above each item row and around each block, in px. Lowering
            // these shortens the receipt and saves paper on long sales, which
            // matters on an 80mm roll.
            $table->unsignedSmallInteger('row_spacing')->default(6);
            $table->unsignedSmallInteger('section_spacing')->default(8);

            // --- Admin-added lines ---
            // Arbitrary extra lines (a returns policy, a promotion, a VAT note)
            // placed at a chosen point in the receipt. JSON because the set is
            // user-defined and unbounded — a column per note is not possible.
            $table->json('custom_fields')->nullable();

            $table->timestamps();

            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receipt_settings');
    }
};
