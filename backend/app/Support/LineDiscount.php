<?php

namespace App\Support;

/**
 * The arithmetic of a discount on one sale line.
 *
 * Kept in one place because three code paths must agree to the cent: pricing a
 * sale as it is saved, previewing an offer against the cart, and the browser's
 * own running total (which mirrors this in posLineDiscount.ts). If any two
 * disagreed, the cashier would quote one total and the sale would record
 * another.
 *
 * An "amount" discount is per unit, not per line. The value usually comes
 * from the item itself, where "Rs 50 off" plainly means Rs 50 off each shirt —
 * so three shirts take Rs 150 off.
 */
final class LineDiscount
{
    public const TYPE_PERCENT = 'percent';

    public const TYPE_AMOUNT = 'amount';

    public static function normalizeType(mixed $type): string
    {
        return $type === self::TYPE_AMOUNT ? self::TYPE_AMOUNT : self::TYPE_PERCENT;
    }

    public static function gross(float $qty, float $unitPrice): float
    {
        return round(max(0, $qty) * max(0, $unitPrice), 2);
    }

    /**
     * Money taken off a line for a discount of $value in $type.
     *
     * Never negative and never more than the line itself, so a mistyped 150%
     * or an amount larger than the price cannot produce a negative line that
     * would pay the customer to take the goods.
     */
    public static function amount(float $qty, float $unitPrice, string $type, float $value): float
    {
        $gross = self::gross($qty, $unitPrice);
        $value = max(0, $value);

        if ($gross <= 0 || $value <= 0) {
            return 0.0;
        }

        $amount = self::normalizeType($type) === self::TYPE_AMOUNT
            ? $value * max(0, $qty)
            : $gross * $value / 100;

        return round(min($gross, $amount), 2);
    }

    /**
     * The largest discount the item allows on this line, or null for no limit.
     *
     * A ceiling of zero means "no limit" rather than "no discount": every item
     * defaults to 0, so reading it as a ban would reject the default discount
     * on every item that never had a maximum set.
     */
    public static function maxAllowed(
        float $qty,
        float $unitPrice,
        float $maxDiscount,
        string $maxDiscountType
    ): ?float {
        if ($maxDiscount <= 0) {
            return null;
        }

        return self::amount($qty, $unitPrice, $maxDiscountType, $maxDiscount);
    }
}
