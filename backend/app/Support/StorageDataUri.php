<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Convert a file on the "public" disk into a base64 `data:` URI.
 *
 * Receipts are printed two ways that both choke on a plain URL:
 *
 *  - the QZ Tray / Tauri path rasterises the receipt with html2canvas, and a
 *    cross-origin image taints the canvas so `toDataURL()` throws;
 *  - the browser-dialog path fires `print()` before a remote image has
 *    finished loading.
 *
 * Embedding the bytes in the markup removes both problems, and keeps working
 * when the API is hosted on a different host or port from the SPA.
 */
class StorageDataUri
{
    /** Inline files up to this size; past it the payload cost outweighs the benefit. */
    private const MAX_BYTES = 512 * 1024;

    public static function fromPath(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        try {
            $disk = Storage::disk('public');

            if (!$disk->exists($path)) {
                return null;
            }

            if ($disk->size($path) > self::MAX_BYTES) {
                return null;
            }

            $mime = $disk->mimeType($path) ?: 'image/png';
            $contents = $disk->get($path);

            if ($contents === null || $contents === '') {
                return null;
            }

            return 'data:' . $mime . ';base64,' . base64_encode($contents);
        } catch (Throwable) {
            // A missing or unreadable logo must never break a sale receipt.
            return null;
        }
    }
}
