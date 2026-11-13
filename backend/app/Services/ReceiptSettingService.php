<?php

namespace App\Services;

use App\Models\ReceiptSetting;
use App\Models\User;

/**
 * Reads and writes the printed receipt's layout.
 *
 * The defaults here are the contract between the editor and the renderer: the
 * frontend preview, the printed receipt and a receipt reprinted months later
 * all resolve missing values through this one place, so a field added later
 * cannot make old rows render differently from new ones.
 */
class ReceiptSettingService
{
    private const BOOLEAN_FIELDS = [
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
        'show_footer_note',
        'show_barcode',
    ];

    /** Field => [min, max]. Clamped rather than rejected, see updateForUser. */
    private const NUMERIC_FIELDS = [
        'font_header' => [8, 28],
        'font_invoice_info' => [7, 20],
        'font_items' => [7, 20],
        'font_totals' => [8, 24],
        'font_footer' => [6, 18],
        'row_spacing' => [0, 24],
        'section_spacing' => [0, 32],
    ];

    private const TEXT_FIELDS = [
        'thank_you_message',
        'footer_note',
    ];

    /**
     * Every caption the receipt prints, and its default wording.
     *
     * Exposed as defaults rather than hardcoded in the renderer so the editor
     * can show the current wording in an editable field, and so a shop that
     * has customised only one label still gets sensible text for the rest.
     */
    public const DEFAULT_LABELS = [
        'receipt_title' => 'TAX INVOICE',
        'sales_id' => 'Invoice No',
        'date' => 'Date',
        'location' => 'Branch',
        'cashier' => 'Cashier',
        'customer' => 'Bill To',
        'item_no' => 'SKU',
        'description' => 'Description',
        'qty' => 'Qty',
        'uom' => 'UOM',
        'unit_price' => 'Rate',
        'total' => 'Amount',
        'sub_total' => 'Subtotal',
        'discount' => 'Discount',
        'service_charge' => 'Delivery charge',
        'card_charge' => 'Card fee',
        'net_amount' => 'Total due',
        'payment' => 'Payment',
        'received' => 'Paid',
        'change' => 'Change',
        'you_saved' => 'You saved',
        'thank_you' => 'Thank you for your business',
    ];

    public const CUSTOM_FIELD_POSITIONS = [
        'after_header',
        'after_invoice',
        'after_items',
        'after_payment',
        'footer',
    ];

    private const CUSTOM_FIELD_ALIGNMENTS = ['left', 'center', 'right'];

    /** Caps the custom-field list so one receipt cannot grow without bound. */
    private const MAX_CUSTOM_FIELDS = 12;

    public function getForUser(User $user): array
    {
        return $this->formatSetting($this->getOrCreateSetting($user));
    }

    public function updateForUser(User $user, array $data): array
    {
        $setting = $this->getOrCreateSetting($user);
        $payload = [];

        foreach (self::BOOLEAN_FIELDS as $field) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = (bool) $data[$field];
            }
        }

        foreach (self::NUMERIC_FIELDS as $field => [$min, $max]) {
            if (array_key_exists($field, $data)) {
                // Clamped, not rejected: these come from sliders and spinners,
                // and refusing the whole save because one slider sat a pixel
                // out of range would lose every other edit on the page.
                $payload[$field] = max($min, min($max, (int) $data[$field]));
            }
        }

        foreach (self::TEXT_FIELDS as $field) {
            if (array_key_exists($field, $data)) {
                $value = trim((string) $data[$field]);
                $payload[$field] = $value === '' ? null : $value;
            }
        }

        if (array_key_exists('labels', $data)) {
            $payload['labels'] = $this->sanitizeLabels($data['labels']);
        }

        if (array_key_exists('custom_fields', $data)) {
            $payload['custom_fields'] = $this->sanitizeCustomFields($data['custom_fields']);
        }

        if ($payload !== []) {
            $setting->update($payload);
        }

        return $this->formatSetting($setting->fresh());
    }

    public function resetForUser(User $user): array
    {
        $setting = $this->getOrCreateSetting($user);
        $setting->delete();

        return $this->formatSetting($this->getOrCreateSetting($user->fresh()));
    }

    /**
     * Only the labels the receipt actually prints are stored.
     *
     * Unknown keys are dropped rather than persisted, so a stale frontend
     * cannot quietly fill the column with fields nothing reads.
     */
    private function sanitizeLabels(mixed $labels): array
    {
        if (!is_array($labels)) {
            return [];
        }

        $clean = [];
        foreach (self::DEFAULT_LABELS as $key => $default) {
            if (!array_key_exists($key, $labels)) {
                continue;
            }

            $value = trim((string) $labels[$key]);
            // A blank label means "use the default", not "print nothing" — an
            // empty column heading would leave an unlabelled receipt column.
            if ($value !== '' && $value !== $default) {
                $clean[$key] = mb_substr($value, 0, 60);
            }
        }

        return $clean;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function sanitizeCustomFields(mixed $fields): array
    {
        if (!is_array($fields)) {
            return [];
        }

        $clean = [];

        foreach ($fields as $field) {
            if (!is_array($field)) {
                continue;
            }

            $label = trim((string) ($field['label'] ?? ''));
            $value = trim((string) ($field['value'] ?? ''));

            // A line with neither a label nor a value would print as a blank
            // gap, so it is dropped instead of saved.
            if ($label === '' && $value === '') {
                continue;
            }

            $position = (string) ($field['position'] ?? 'footer');
            $align = (string) ($field['align'] ?? 'center');

            $clean[] = [
                'id' => (string) ($field['id'] ?? uniqid('rcf_', true)),
                'label' => mb_substr($label, 0, 60),
                'value' => mb_substr($value, 0, 200),
                'position' => in_array($position, self::CUSTOM_FIELD_POSITIONS, true)
                    ? $position
                    : 'footer',
                'align' => in_array($align, self::CUSTOM_FIELD_ALIGNMENTS, true)
                    ? $align
                    : 'center',
                'font_size' => max(6, min(20, (int) ($field['font_size'] ?? 10))),
                'bold' => (bool) ($field['bold'] ?? false),
            ];

            if (count($clean) >= self::MAX_CUSTOM_FIELDS) {
                break;
            }
        }

        return $clean;
    }

    private function getOrCreateSetting(User $user): ReceiptSetting
    {
        return ReceiptSetting::firstOrCreate(['user_id' => $user->id]);
    }

    /**
     * The shape both the editor and the receipt renderer consume.
     *
     * `labels` is always returned complete — defaults merged with the shop's
     * overrides — so no consumer has to know the default wording.
     */
    private function formatSetting(ReceiptSetting $setting): array
    {
        $data = ['id' => $setting->id];

        foreach (self::BOOLEAN_FIELDS as $field) {
            $data[$field] = (bool) $setting->{$field};
        }

        foreach (array_keys(self::NUMERIC_FIELDS) as $field) {
            $data[$field] = (int) $setting->{$field};
        }

        $data['thank_you_message'] = $setting->thank_you_message
            ?? self::DEFAULT_LABELS['thank_you'];
        $data['footer_note'] = $setting->footer_note ?? '';
        $data['labels'] = array_merge(self::DEFAULT_LABELS, $setting->labels ?? []);
        $data['custom_fields'] = array_values($setting->custom_fields ?? []);

        return $data;
    }
}
