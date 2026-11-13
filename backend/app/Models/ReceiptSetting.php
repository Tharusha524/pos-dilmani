<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property array<string, string>|null $labels
 * @property array<int, array<string, mixed>>|null $custom_fields
 */
class ReceiptSetting extends Model
{
    protected $fillable = [
        'user_id',
        'show_logo',
        'show_shop_name',
        'show_address',
        'show_phone',
        'show_email',
        'show_tax_id',
        'show_invoice_id',
        'show_date_time',
        'show_cashier',
        'show_branch_name',
        'show_customer_name',
        'show_item_number',
        'show_item_uom',
        'show_unit_price',
        'show_discount_column',
        'show_payment_method',
        'show_amount_received',
        'show_change',
        'show_you_saved',
        'show_thank_you',
        'thank_you_message',
        'show_footer_note',
        'footer_note',
        'show_barcode',
        'labels',
        'font_header',
        'font_invoice_info',
        'font_items',
        'font_totals',
        'font_footer',
        'row_spacing',
        'section_spacing',
        'custom_fields',
    ];

    protected function casts(): array
    {
        return [
            'show_logo' => 'boolean',
            'show_shop_name' => 'boolean',
            'show_address' => 'boolean',
            'show_phone' => 'boolean',
            'show_email' => 'boolean',
            'show_tax_id' => 'boolean',
            'show_invoice_id' => 'boolean',
            'show_date_time' => 'boolean',
            'show_cashier' => 'boolean',
            'show_branch_name' => 'boolean',
            'show_customer_name' => 'boolean',
            'show_item_number' => 'boolean',
            'show_item_uom' => 'boolean',
            'show_unit_price' => 'boolean',
            'show_discount_column' => 'boolean',
            'show_payment_method' => 'boolean',
            'show_amount_received' => 'boolean',
            'show_change' => 'boolean',
            'show_you_saved' => 'boolean',
            'show_thank_you' => 'boolean',
            'show_footer_note' => 'boolean',
            'show_barcode' => 'boolean',
            'labels' => 'array',
            'custom_fields' => 'array',
            'font_header' => 'integer',
            'font_invoice_info' => 'integer',
            'font_items' => 'integer',
            'font_totals' => 'integer',
            'font_footer' => 'integer',
            'row_spacing' => 'integer',
            'section_spacing' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
