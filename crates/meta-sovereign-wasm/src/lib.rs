//! Browser-facing WebAssembly exports for the Rust core.
//!
//! The JavaScript wrapper writes UTF-8 strings into the exported memory
//! and calls [`pattern_matches`] so the SPA can run the same matcher as
//! the pure-Rust server for heavy pattern previews.

use std::alloc::{alloc, dealloc, Layout};
use std::slice;

#[no_mangle]
pub extern "C" fn ms_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }
    let layout = match Layout::array::<u8>(len) {
        Ok(layout) => layout,
        Err(_) => return std::ptr::null_mut(),
    };
    unsafe { alloc(layout) }
}

#[no_mangle]
pub unsafe extern "C" fn ms_dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    if let Ok(layout) = Layout::array::<u8>(len) {
        unsafe {
            dealloc(ptr, layout);
        }
    }
}

fn matches_utf8(pattern: &[u8], input: &[u8]) -> u32 {
    let Ok(pattern) = std::str::from_utf8(pattern) else {
        return 0;
    };
    let Ok(input) = std::str::from_utf8(input) else {
        return 0;
    };
    u32::from(meta_sovereign_core::pattern_matches(pattern, input))
}

#[no_mangle]
pub unsafe extern "C" fn pattern_matches(
    pattern_ptr: *const u8,
    pattern_len: usize,
    input_ptr: *const u8,
    input_len: usize,
) -> u32 {
    if pattern_ptr.is_null() || input_ptr.is_null() {
        return 0;
    }
    let pattern = unsafe { slice::from_raw_parts(pattern_ptr, pattern_len) };
    let input = unsafe { slice::from_raw_parts(input_ptr, input_len) };
    matches_utf8(pattern, input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_matcher_uses_core_pattern_logic() {
        let pattern = b"^hello\\s+\\S+$";
        let input = b"hello alice";
        assert_eq!(matches_utf8(pattern, input), 1);
        assert_eq!(matches_utf8(pattern, b"bye alice"), 0);
    }
}
