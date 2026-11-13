use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
fn print_receipt_escpos(
    printer_name: String,
    image_base64: String,
    auto_cut: bool,
) -> Result<(), String> {
    let png_bytes = general_purpose::STANDARD
        .decode(&image_base64)
        .map_err(|e| format!("Base64 decode error: {e}"))?;

    let img = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("Image decode error: {e}"))?
        .to_luma8();

    let width = img.width();
    let height = img.height();
    let bytes_per_line = ((width + 7) / 8) as usize;

    let mut esc: Vec<u8> = Vec::new();
    esc.extend_from_slice(b"\x1B\x40");

    let strip_height: u32 = 255;
    let xl = (bytes_per_line & 0xFF) as u8;
    let xh = ((bytes_per_line >> 8) & 0xFF) as u8;
    let mut y_start = 0u32;
    while y_start < height {
        let y_end = (y_start + strip_height).min(height);
        let strip_lines = y_end - y_start;
        let yl = (strip_lines & 0xFF) as u8;
        let yh = ((strip_lines >> 8) & 0xFF) as u8;
        esc.extend_from_slice(&[0x1D, 0x76, 0x30, 0x00, xl, xh, yl, yh]);
        for y in y_start..y_end {
            let mut byte_val: u8 = 0;
            let mut bit = 0u32;
            for x in 0..width {
                let luma = img.get_pixel(x, y).0[0];
                if luma < 180 {
                    byte_val |= 1 << (7 - (bit % 8));
                }
                bit += 1;
                if bit % 8 == 0 {
                    esc.push(byte_val);
                    byte_val = 0;
                }
            }
            if bit % 8 != 0 {
                esc.push(byte_val);
            }
            let written = ((width + 7) / 8) as usize;
            for _ in written..bytes_per_line {
                esc.push(0);
            }
        }
        y_start = y_end;
    }

    esc.extend_from_slice(b"\x1B\x64\x04");
    if auto_cut {
        esc.extend_from_slice(b"\x1D\x56\x41\x03");
    }

    #[cfg(target_os = "windows")]
    {
        send_raw_to_windows_printer(&printer_name, &esc)?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = printer_name;
        return Err("ESC/POS printing is only supported on Windows".to_string());
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn send_raw_to_windows_printer(printer_name: &str, data: &[u8]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::ptr;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::winnt::HANDLE;
    use winapi::um::winspool::{
        ClosePrinter, DOC_INFO_1W, EndDocPrinter, EndPagePrinter, OpenPrinterW,
        StartDocPrinterW, StartPagePrinter, WritePrinter,
    };

    let wide = |s: &str| -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    };

    let printer_wide = wide(printer_name);
    let doc_name_wide = wide("Receipt");
    let datatype_wide = wide("RAW");

    unsafe {
        let mut handle: HANDLE = ptr::null_mut();
        if OpenPrinterW(
            printer_wide.as_ptr() as *mut _,
            &mut handle,
            ptr::null_mut(),
        ) == 0
        {
            return Err(format!(
                "Cannot open printer '{}'. Make sure it is installed and powered on.",
                printer_name
            ));
        }

        let mut doc_info = DOC_INFO_1W {
            pDocName: doc_name_wide.as_ptr() as *mut _,
            pOutputFile: ptr::null_mut(),
            pDatatype: datatype_wide.as_ptr() as *mut _,
        };

        if StartDocPrinterW(handle, 1, &mut doc_info as *mut _ as *mut u8) == 0 {
            ClosePrinter(handle);
            return Err("StartDocPrinter failed. Check printer status.".to_string());
        }

        if StartPagePrinter(handle) == 0 {
            EndDocPrinter(handle);
            ClosePrinter(handle);
            return Err("StartPagePrinter failed.".to_string());
        }

        let mut written: DWORD = 0;
        WritePrinter(
            handle,
            data.as_ptr() as *mut _,
            data.len() as DWORD,
            &mut written,
        );

        EndPagePrinter(handle);
        EndDocPrinter(handle);
        ClosePrinter(handle);
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![print_receipt_escpos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
