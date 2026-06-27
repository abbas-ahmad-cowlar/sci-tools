# BitForge

A **register & bitfield workbench** for embedded and systems developers. It's the tool
you reach for when you're staring at a datasheet, decoding a status register, or trying
to remember whether that shift was supposed to sign-extend.

One file. No build step. No network. No telemetry. **Just open `index.html`.**

![BitForge](https://img.shields.io/badge/offline-100%25-34e8a4) ![BitForge](https://img.shields.io/badge/64--bit-exact-ffb547)

---

## Why it exists

Most bit calculators are either anemic (8/16/32-bit only, no fields) or live behind an
ad-wall online. BitForge is a single self-contained HTML file you can drop next to your
firmware project, double-click, and use on a plane. Every value is computed with
JavaScript **BigInt**, so 64-bit math is *exact*, native JS bitwise operators silently
truncate to 32 bits, which is exactly the kind of bug this tool exists to avoid.

## Features

- **Live multi-base conversion**: HEX / DEC / OCT / BIN, all editable, all in sync.
  Decimal respects the signed/unsigned toggle. Inputs accept `0x`, `0b`, `0o` prefixes,
  spaces, and underscores.
- **Interactive register map**: one row per byte (MSB top-left), every bit clickable to
  toggle. Live per-byte hex and ASCII on the right, just like a memory dump.
- **64-bit-exact arithmetic**: masking, two's-complement, shifts, and rotates all done
  with BigInt and masked to the active word width (8 / 16 / 32 / 64).
- **Full operation set**
  - Logic: `AND`, `OR`, `XOR`, `AND~` (clear bits), `NAND`, `NOR`, `XNOR`, `SET`
  - Shift/rotate: `SHL`, `SHR` (logical), `SAR` (arithmetic / sign-extending), `ROL`, `ROR`
  - Arithmetic: `ADD`, `SUB`, `MUL` (all wrap at the word width)
  - Unary: `NOT`, `NEG`, reverse bits, byte-swap (endianness), set-all, set lowest/highest clear bit
- **Named bitfields**: carve the word into regions (`hi:lo`), give them names, and read
  each field's decoded value (signed + unsigned). Edit a field's value in place and it's
  written straight back into the word. Field regions are color-coded on the register map.
  Presets included (RGBA8888, packed RTC time).
- **IEEE-754 interpretation**: see the current bits as a **half** (16-bit), **single**
  (32-bit), or **double** (64-bit) float, and type a float to get its exact bit pattern.
- **Copy-ready C export**: hex / binary / decimal literals with correct `U`/`ULL`
  suffixes, a typed declaration (`uint32_t reg = 0x...;`), and auto-generated
  `#define NAME_MASK / NAME_SHIFT` macros for your bitfields.
- **Bit statistics**: population count, parity, highest/lowest set bit, signed vs.
  unsigned side by side.
- **Shareable state**: the full state (width, sign, value, fields) lives in the URL hash.
  Hit **SHARE** to copy a link that restores the exact view. Great for bug reports.

## Usage

```
# Just open it:
start index.html        # Windows
open  index.html        # macOS
xdg-open index.html     # Linux
```

It works straight from `file://`, there's no bundler, no dependencies, nothing to install.
If you prefer to serve it (e.g. to share on a LAN):

```
python -m http.server 8799    # then visit http://localhost:8799/
```

### Keyboard

- **Click** any bit in the register map to toggle it.
- **Enter** in the operand box applies `AND`; in a base field it reformats; in a field
  value it commits the edit.
- **Esc** drops focus.

## Examples

| You want to…                              | Do this                                                            |
|-------------------------------------------|--------------------------------------------------------------------|
| Decode a 32-bit status register           | Paste the hex, define fields from the datasheet, read the values   |
| Check what `0xC0` looks like after `SAR 1`| width 8 → set `0xC0` → operand `1` → `SAR` → `0xE0` (sign-extended) |
| Find the bits of `3.14159f`               | width 32 → type `3.14159` in the float box → `⟶ BITS`              |
| Build packed RGBA and get the macros      | load preset **RGBA8888** → edit R/G/B/A → copy the field defs       |
| Swap endianness of a word                 | **BYTE SWAP**                                                       |

## Correctness

The math is covered by an in-page test suite (40 assertions: masking, two's-complement,
popcount, bit-reverse, byte-swap, logical/arithmetic shifts, rotates, parsing, and
IEEE-754 half/single/double round-trips, plus bitfield insert/extract).

Run it via the **run self-tests** link in the footer, or open
[`index.html?test=1`](index.html?test=1). A green `● ALL TESTS PASSED` means you're good.

## Design notes

- The canonical stored value is always the **unsigned** representation in `[0, 2^width)`.
  Signedness is a pure interpretation layer applied at display time, this keeps the
  bitwise math unambiguous.
- Arithmetic shift right (`SAR`) converts to the signed value, shifts (BigInt `>>` floors,
  which sign-extends), then re-masks, so it behaves like C's `>>` on a signed type.
- Half-precision (16-bit) float conversion is implemented by hand (no `getFloat16`
  dependency) including subnormals, rounding, and inf/nan.

## License

Do whatever you like with it. Built as a self-contained, offline gift of a tool.
