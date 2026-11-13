<?php

namespace Tests\Unit;

use App\Support\LineDiscount;
use PHPUnit\Framework\TestCase;

/**
 * The browser mirrors this arithmetic in posLineDiscount.ts, and its test file
 * asserts the same cases. If either side changes, both suites should change
 * together — otherwise the till and the saved sale disagree.
 */
class LineDiscountTest extends TestCase
{
    public function test_percent_discount_comes_off_the_line_gross(): void
    {
        // 3 × Rs 1,000 = 3,000; 10% = 300.
        $this->assertSame(300.0, LineDiscount::amount(3, 1000, 'percent', 10));
    }

    public function test_amount_discount_is_per_unit_not_per_line(): void
    {
        // "Rs 50 off" set on an item means each shirt, so 3 take Rs 150 off.
        $this->assertSame(150.0, LineDiscount::amount(3, 1000, 'amount', 50));
    }

    public function test_discount_never_exceeds_the_line(): void
    {
        // A mistyped 150% must not make the line negative.
        $this->assertSame(1000.0, LineDiscount::amount(1, 1000, 'percent', 150));
        $this->assertSame(1000.0, LineDiscount::amount(1, 1000, 'amount', 5000));
    }

    public function test_zero_or_negative_value_means_no_discount(): void
    {
        $this->assertSame(0.0, LineDiscount::amount(2, 1000, 'percent', 0));
        $this->assertSame(0.0, LineDiscount::amount(2, 1000, 'percent', -10));
    }

    public function test_a_free_line_has_nothing_to_discount(): void
    {
        $this->assertSame(0.0, LineDiscount::amount(2, 0, 'percent', 10));
    }

    public function test_unknown_type_is_treated_as_percent(): void
    {
        $this->assertSame('percent', LineDiscount::normalizeType('bogus'));
        $this->assertSame('percent', LineDiscount::normalizeType(null));
        $this->assertSame('amount', LineDiscount::normalizeType('amount'));
        $this->assertSame(100.0, LineDiscount::amount(1, 1000, 'bogus', 10));
    }

    public function test_results_are_rounded_to_cents(): void
    {
        // 1 × 99.99 at 33.33% = 33.326667 -> 33.33
        $this->assertSame(33.33, LineDiscount::amount(1, 99.99, 'percent', 33.33));
    }

    public function test_decimal_quantities_scale_an_amount_discount(): void
    {
        // Sold by weight: 1.5 kg at Rs 20/kg off = Rs 30.
        $this->assertSame(30.0, LineDiscount::amount(1.5, 400, 'amount', 20));
    }

    public function test_zero_ceiling_means_no_limit(): void
    {
        // Every item defaults to max 0. Reading that as "no discount allowed"
        // would reject the default discount on every such item.
        $this->assertNull(LineDiscount::maxAllowed(2, 1000, 0, 'percent'));
    }

    public function test_percent_ceiling_scales_with_the_line(): void
    {
        // Max 20% of a 2,000 line is 400.
        $this->assertSame(400.0, LineDiscount::maxAllowed(2, 1000, 20, 'percent'));
    }

    public function test_amount_ceiling_is_per_unit(): void
    {
        // Max Rs 100 per unit across 2 units is 200.
        $this->assertSame(200.0, LineDiscount::maxAllowed(2, 1000, 100, 'amount'));
    }

    public function test_gross_ignores_negative_inputs(): void
    {
        $this->assertSame(0.0, LineDiscount::gross(-1, 1000));
        $this->assertSame(0.0, LineDiscount::gross(1, -1000));
        $this->assertSame(2500.5, LineDiscount::gross(1, 2500.5));
    }
}
