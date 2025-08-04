https://www.iso.org/standard/18902.html

> Information technology — Digital compression and coding of continuous-tone still images: Requirements and guidelines


> Specifies processes for converting source image data to compressed image data,
> processes for converting compressed image data to reconstructed image data,
> coded representations for compressed image data, and gives guidance on how to
> implement these processes in practice. Is applicable to continuous-tone -
> grayscale or colour - digital still image data and to a wide range of
> applications which require use of compressed images. Is not applicable to
> bi-level image data.

https://www.w3.org/Graphics/JPEG/itu-t81.pdf

# Summary of ITU T81 (ISO JPEG Part 1) Specification

A JPEG image is a rectangle of "pixels". Pixels have **sample** values for each
color **component** (for example, R-G-B, or Y-Cb-Cr). The resolution of some
components can be lower than other components.

A JPEG file is a sequence of **markers**, each optionally followed by a
**length prefixed header**, and optionally followed by **entropy coded data**.

A **marker value** is a two byte sequence where the first byte is `0xFF` and the
second byte is neither `0xFF` nor `0x00`.

| Marker   | Name                                 | Marker value            | Followed by length-prefixed header | Followed by entropy coded data |
|----------|--------------------------------------|-------------------------|------------------------------------|--------------------------------|
| `SOI*`   | Start of Image                       | `0xFF_D8`               | no                                 | no                             |
| `SOF3`   | Start of Frame: Lossless, sequential | `0xFF_C3`               | YES                                | no                             |
| `DHT`    | Define Huffman Table                 | `0xFF_C4`               | YES                                | no                             |
| `SOS`    | Start of Scan                        | `0xFF_DA`               | YES                                | YES                            |
| `RST_m*` | Reset scan                           | `0xFF_D0` ... `0xFF_D7` | no                                 | YES (TODO)                     |
| `EOI*`   | End of Image                         | `0xFF_D9`               | no                                 | no                             |

Each header contains parameters and possibly table entries associated with that
marker. The actual pixel data exists in the "entropy coded data" segment.

Note that frame headers _might_ contain marker values, but entropy-coded data
uses *byte stuffing* (see below) to ensure that they do not contain marker
values.

## SOF_n (SOF3, etc) (Start of Frame) Header (from B.2.2)

| Parameter | Type  | Description |
|-----------|-------|-------------|
| `Lf`      | `U16` | The length of the header (including the `Lf` field), in bytes.
| `P`       | `U8`  | The precision of sample data, in bits.<br />Must be one of: 2, 3, ..., 16.
| `Y`       | `U16` | The number of rows in the image.
| `X`       | `U16` | The number of columns in the image.
| `Nf`      | `U8`  | The number of components in the image.
| `C_1`     | `U8`  | The ID of the component.<br />Must be unique amongst all `C_i` values in this image.
| `H_1`     | `U4` (most-significant) | The horizontal sampling factor of the component
| `V_1`     | `U4` (least-significant) | The vertical sampling factor of the
| `Tq_1`    | `U8`  | The quantization table destination to use for this component.<br />Must be 0 (unused) for lossless images.
| ...       |
| `C_{Nf}`  | `U8`  |
| `H_{Nf}`  | `U4` (most significant) |
| `V_{Nf}`  | `U4` (least significant) |
| `Tq_{Nf}` | `U8`  |

## DHT (Define Huffman Table) Header (from B.2.4.2)

| Parameter      | Type  | Description |
|----------------|-------|-------------|
| `Lh`           | `U16` | The length of the header (including `Lh`), in bytes.
| `Tc`           | `U4` (most significant)  | <br />Lossless: Must be 0.
| `Th`           | `U4` (least significant) | Huffman table ID.
| `L_1`          | `U8`  | The number of Huffman codes of 1 bit.<br />Must be in [0, 2^1-1].
| ...            |       |
| `L_16`         | `U8`  | The number of Huffman codes of 16 bits.<br />Must be in [0, 2^16-1].
| `V_{1, 1}`     | `U8`  |
| ...            |
| `V_{1, L_1}`   | `U8`
| ...            |
| `V_{a,b}`      | `U8`  | The value associated with the lexicographically `a`-th Huffman code with length `b` bits
| ...            |
| `V_{16, 1}`    |
| ...            |
| `V_{16, L_16}` | ditto

Huffman codes are assigned to values in the table in lexicographic order,
starting from 0. Huffman codes are *prefix free*, meaning later codes must NOT
have earlier (shorter) codes as a prefix.

No code uses an all `1`s representation.

For example, if `L_1=1`, `L_2=0`, `L_3=2`, `L_4=3`, then

* L=1: `0b0`
* L=2: [none]
* L=3: `0b100`, `0b101`
* L=4: `0b1100`, `0b1101`, `0b1110`

## SOS (Start of Scan) Header (from B.2.3)

| Parameter | Type                     | Description |
|-----------|--------------------------|-------------|
| `Ls`      | `U16`                    |
| `Ns`      | `U8`                     |
| `Cs_1`    | `U8`                     |
| `Td_1`    | `U4` (most significant)  |
| `Ta_1`    | `U4` (least significant) |
| ...       |
| `Cs_{Ns}` | ditto                    |
| `Td_{Ns}` | ditto
| `Ta_{Ns}` | ditto
| `Ss`      | `U8`                     |
| `Se`      | `U8`                     |
| `Ah`      | `U4` (most significant)  |
| `Al`      | `U4` (least significant) |

## Lossless sequential Huffman coded scan data
### Byte Stuffing
The output of entropy-coding (Huffman coding or Arithmetic coding) has
**byte stuffing** applied.

Any occurrence of the `0xFF` byte is replaced with the sequence `0xFF_00`.

This ensure that the body of an entropy-coded segment *does not* contain any
markers.

In addition, the end of the stream may be padded with `0xFF` bytes for alignment
or other padding purposes.

### Encoding magnitude-difference pairs (F.1.5.1)
A sequence of _difference values_ are encoded using this table:

| Magnitude (`SSSS`) | Range |
|--------------------|-------|
| 0                  | {0}
| 1                  | {-1} `0b0` and {1} `0b1`
| 2                  | {-3 `0b00`, -2 `0b01`} and {2 `0b10`, 3 `0b11`}
| 3                  | {-7 `0b000`, ..., -4 `0b011`} and {4 `0b100`, ..., 7 `0b111`}
| ...                |
| 15                 | {-32_767, ..., -16_384} and {16_384, ..., 32_767}
| 16                 | {32_768}

The "magnitude" part indicates the number of bits that follow
(except for SSSS=16), which is an encoding of the actual difference.

### Applying prediction (from H.1.2.1)
The differences are the difference between a "predicted" value an the actual
image value for each component.

The prediction is based on preceding values for the same component.

| Target         | Prediction       |
|----------------|------------------|
| First pixel: `Img[x=0, y=0]`| $2^{P - Pt - 1}$ |
| Rest of first row: `Img[x=u, y=0]`  | `Img[x=u-1, y=v]` (same as predictor=1)
| Rest of first column: `Img[x=0, y=v]` | `Img[x=0, y=v-1]` (same as predictor=2)
| Rest, predictor=1: `Img[x=u, y=v]` | `Img[x=u-1, y=v]` (sample 1 left)
| Rest, predictor=2: `Img[x=u, y=v]` | `Img[x=u, y=v-1]` (sample 1 above)
| Rest, predictor=3: `Img[x=u, y=v]` | `Img[x=u-1, y=v-1]` (sample 1 up-left)
| Rest, predictor=4: `Img[x=u, y=v]` | `Img[x=u-1, y=v] + Img[x=u, y=v-1] - Img[x=u-1, y=v-1]` (2D)
| Rest, predictor=5: `Img[x=u, y=v]` | `Img[x=u-1, y=v] + ((Img[x=u, y=v-1] - Img[x=u-1, y=v-1]) >> 1)` (2D)
| Rest, predictor=6: `Img[x=u, y=v]` | `Img[x=u, y=v-1] + ((Img[x=u-1, y=v] - Img[x=u-1, y=v-1]) >> 1)` (2D)
| Rest, predictor=7: `Img[x=u, y=v]` | `(Img[x=u-1, y=v] + Img[x=u, y=v-1]) >> 1` (2D)
