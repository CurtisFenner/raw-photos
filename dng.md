# Implementation of DNG 1.7.1.0

https://helpx.adobe.com/content/dam/help/en/camera-raw/digital-negative/jcr_content/root/content/flex/items/position/position-par/download_section_733958301/download-1/DNG_Spec_1_7_1_0.pdf

> The Digital Negative (DNG) Specification describes a non-proprietary file
> format for storing camera raw files
> that can be used by a wide range of hardware and software vendors


## TIFF Compatible (page 12)

> DNG is an extension of the TIFF 6.0 format, and is compatible with the TIFF-EP standard. It is possible (but not
required) for a DNG file to simultaneously comply with both the Digital Negative specification and the TIFF-EP
standard.


## File Extensions (page 13)

Use `.DNG`. `.TIF` can be used for compatibility with TIFF-EP.

## SubIFD Trees

* SubIFD trees are recommended.
* SubIFD chains are not supported.

## Byte Order

Readers **must** support either byte-order.

# Image Data Compression (page 20)

> Two Compression tag values are supported in DNG versions before 1.4.0.0:
> * Value = 1: Uncompressed data.
> * Value = 7: JPEG compressed data, either baseline DCT JPEG, or lossless JPEG compression.
>
> If
> * PhotometricInterpretation = 6 (YCbCr) and BitsPerSample = 8/8/8,
> * or PhotometricInterpretation = 1 (BlackIsZero) and BitsPerSample = 8,
>
> then the JPEG variant must be baseline DCT JPEG.

> Otherwise, the JPEG variant must be lossless Huffman JPEG. For lossless JPEG, the internal
width/length/components in the JPEG stream are not required to match the strip or tile's
width/length/components. Only the total sample counts need to match. It is common for CFA images to be
encoded with a different width, length or component count to allow the JPEG compression predictors to
work across like colors.


> DNG Version 1.4.0.0 adds support for the following compression codes:
> * Value = 8: Deflate (ZIP)
> * Value = 34892: Lossy JPEG
>
> Deflate (8) compression is allowed for floating point image data, 32-bit integer image data, transparency
mask data, and depth map data.
>
> Lossy JPEG (34892) is allowed for IFDs that use 8-bit integer data and one of the following
PhotometricInterpretation values:
> * 34892 (LinearRaw)
> * 52527 (PhotometricMask)
>
> This compression code is required to let the DNG reader know to use a lossy JPEG decoder rather than a
lossless JPEG decoder for this combination of PhotometricInterpretation and BitsPerSample.



> The following values are supported for thumbnail and preview IFDs only:
> * 1 = BlackIsZero. Assumed to be in a gamma 2.2 color space, unless otherwise specified using
PreviewColorSpace tag.
> * 2 = RGB. Assumed to be in the sRGB color space, unless otherwise specified using the
PreviewColorSpace tag.
> * 6 = YCbCr. Used for JPEG encoded preview images.
The following values are supported for the raw IFD, and are assumed to be the camera's native color space:
> * 32803 = CFA (Color Filter Array).
> * 34892 = LinearRaw.
>
> The CFA PhotometricInterpretation value is documented in the TIFF-EP specification. Its use requires the use
of the CFARepeatPatternDim and CFAPattern tags in the same IFD. The origin of the repeating CFA pattern is
the top-left corner of the ActiveArea rectangle.
The LinearRaw PhotometricInterpretation value is intended for use by cameras that do not use color filter
arrays, but instead capture all color components at each pixel. It can also be used for CFA data that has
already been de-mosaiced
