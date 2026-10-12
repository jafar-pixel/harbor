#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

// Laptops with Intel plus NVIDIA or AMD graphics run unmarked apps on the integrated chip and copy
// every frame to the discrete card that drives the monitors, which makes video stutter. The
// drivers look for these exports in the executable (build.rs exports them) and pick the discrete
// GPU, where mpv renders.
#[cfg(target_os = "windows")]
#[no_mangle]
#[used]
pub static NvOptimusEnablement: u32 = 1;
#[cfg(target_os = "windows")]
#[no_mangle]
#[used]
pub static AmdPowerXpressRequestHighPerformance: i32 = 1;

fn main() {
    harbor_lib::run()
}
