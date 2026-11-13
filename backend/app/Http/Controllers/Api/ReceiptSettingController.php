<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReceiptSettingService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReceiptSettingController extends Controller
{
    public function __construct(private ReceiptSettingService $receiptSettingService)
    {
    }

    public function show(Request $request)
    {
        try {
            return response()->json([
                'success' => true,
                'data' => $this->receiptSettingService->getForUser($request->user()),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    public function update(Request $request)
    {
        try {
            $validated = $request->validate([
                'show_logo' => 'nullable|boolean',
                'show_shop_name' => 'nullable|boolean',
                'show_address' => 'nullable|boolean',
                'show_phone' => 'nullable|boolean',
                'show_email' => 'nullable|boolean',
                'show_tax_id' => 'nullable|boolean',
                'show_invoice_id' => 'nullable|boolean',
                'show_date_time' => 'nullable|boolean',
                'show_cashier' => 'nullable|boolean',
                'show_branch_name' => 'nullable|boolean',
                'show_customer_name' => 'nullable|boolean',
                'show_item_number' => 'nullable|boolean',
                'show_item_uom' => 'nullable|boolean',
                'show_unit_price' => 'nullable|boolean',
                'show_discount_column' => 'nullable|boolean',
                'show_payment_method' => 'nullable|boolean',
                'show_amount_received' => 'nullable|boolean',
                'show_change' => 'nullable|boolean',
                'show_you_saved' => 'nullable|boolean',
                'show_thank_you' => 'nullable|boolean',
                'thank_you_message' => 'nullable|string|max:200',
                'show_footer_note' => 'nullable|boolean',
                'footer_note' => 'nullable|string|max:500',
                'show_barcode' => 'nullable|boolean',

                // Sizes and spacing are clamped in the service rather than
                // rejected here, so one out-of-range slider cannot discard a
                // whole page of edits.
                'font_header' => 'nullable|integer',
                'font_invoice_info' => 'nullable|integer',
                'font_items' => 'nullable|integer',
                'font_totals' => 'nullable|integer',
                'font_footer' => 'nullable|integer',
                'row_spacing' => 'nullable|integer',
                'section_spacing' => 'nullable|integer',

                'labels' => 'nullable|array',
                'labels.*' => 'nullable|string|max:60',

                'custom_fields' => 'nullable|array|max:12',
                'custom_fields.*.id' => 'nullable|string|max:64',
                'custom_fields.*.label' => 'nullable|string|max:60',
                'custom_fields.*.value' => 'nullable|string|max:200',
                'custom_fields.*.position' => [
                    'nullable',
                    'string',
                    Rule::in(ReceiptSettingService::CUSTOM_FIELD_POSITIONS),
                ],
                'custom_fields.*.align' => ['nullable', 'string', Rule::in(['left', 'center', 'right'])],
                'custom_fields.*.font_size' => 'nullable|integer',
                'custom_fields.*.bold' => 'nullable|boolean',
            ]);

            $data = $this->receiptSettingService->updateForUser($request->user(), $validated);

            return response()->json([
                'success' => true,
                'message' => 'Receipt settings saved successfully',
                'data' => $data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    public function reset(Request $request)
    {
        try {
            $data = $this->receiptSettingService->resetForUser($request->user());

            return response()->json([
                'success' => true,
                'message' => 'Receipt settings reset to defaults',
                'data' => $data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }
}
