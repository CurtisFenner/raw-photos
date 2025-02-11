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
