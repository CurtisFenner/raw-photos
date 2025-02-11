# TIFF/EP

* The official purchase page for ISO 12234-2:2001 (the ISO ID for TIFF/EP)
    * https://www.iso.org/standard/29377.html
* The latest version of the Adobe TIFF 6 specification (which TIFF/EP is an adaptation of)
    * https://helpx.adobe.com/content/dam/help/en/camera-raw/digital-negative/jcr_content/root/content/flex/items/position/position-par/download_section_1690056821/download-1/TIFF6.pdf
* A draft of the TIFF/EP specification (PDF)
    * https://web.archive.org/web/20120128084017/http://www.barrypearson.co.uk/top2009/downloads/TAG2000-22_DIS12234-2.pdf

# 4.1 (page 7)

A TIFF/EP file is a sequence of up to 2^(32)-1 octets.

A TIFF/EP file begins with an 8-octet Image File Header.

## 4.1.1 Image File Header (page 7)

```
ByteOrderMark = 0x49 0x49 (II, little-endian) | 0x4d 0x4d (MM, big-endian)

-- Note that values _larger_ than 42 may be used by future versions
-- of the specification for later versions.
TiffMarker = U16(42)

-- Always measured from the beginning of the TIFF file.
-- The first byte in the file has offset 0.
ByteOffset = U32

ImageFileHeader = {
    ByteOrderMark
    TiffMarker
    firstIFDOffsetBytes: ByteOffset
}
```

## 4.1.2 Image File Directory (page 8)

```
ImageFileDirectory = {
    -- shall be at least 1
    entryCount: U16,
    -- `entries` should be sorted in ascending order of tag value.
    entries: IFDEntry[entryCount],
    -- 0 if this is the last IFD.
    nextDirectory: ByteOffset,
}

IFDEntry = {
    tag: U16,
    -- 1: U8
    -- 2: null-terminated 7-bit ASCII.
    --    The null byte "0x00" is included in the count.
    --    Multiple strings MAY be included in a single value,
    --    each terminated by a 0x00.
    --    0x00 should not be immediately followed by an other 0x00.
    -- 3: U16
    -- 4: U32
    -- 5: Rational (num: U32, den: U32)
    -- 6: I8
    -- 7: U8 ("undefined")
    -- 8: I16
    -- 9: I32
    -- 10: Signed rational: (num: I32, den: I32)
    -- 11: F32
    -- 12: F64
    fieldType: U16,
    -- The number of values (not bytes).
    -- For string (Type 2), counts bytes.
    valueCount: U32,
    -- Should be on a word-offset.
    -- IF THE TYPE AND COUNT combine to fit in the FIRST BYTES,
    -- regardless of byte order. (Later bytes are "don't care")
    valueOffset: ByteOffset | U8 * U8[3]xxx | U16 * U8[2]xx | U32,
}
```

# 4.2 Image Data (page 9)

* `ImageWidth` tag
* `Orientation` tag
* `ImageLength` tag (height)
* `XResolution`
* `YResolution`
* `ResolutionUnits`

Image data is stored in "segments". These are either "strips" of rows, or
"tiles" of rectangular regions of the image. Each one can be compressed and
therefore read / updated independently.

> NOTE if the image data is compressed using JPEG, i.e. Compression tag-field
> contains the value of 7, each segment (strip or tile) shall contain a valid
> JPEG datastream according to the ISO JPEG standard's rules for
> interchange-format or abbreviated image-format data.

> (From Introduction)
> TIFF/EP uses the TIFF/JPEG specification given in
> "DRAFT TIFF Technical Note #2".
> This method differs from the JPEG method described in the TIFF 6.0
> specification.
> In the method used within TIFF/EP, each image segment (tile or strip) contains
> a complete JPEG data stream that is valid according to the ISO JPEG standard
> (ISO IEC 10918-1). TIFF/EP requires that readers only support the DCT based
> lossy JPEG process.
