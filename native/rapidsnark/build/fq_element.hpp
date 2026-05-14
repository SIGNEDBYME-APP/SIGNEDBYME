#ifndef FQ_ELEMENT_HPP
#define FQ_ELEMENT_HPP

#include <cstdint>

#define Fq_N64 4
#define Fq_SHORT           0x00000000
#define Fq_MONTGOMERY      0x40000000
#define Fq_SHORTMONTGOMERY 0x40000000
#define Fq_LONG            0x80000000
#define Fq_LONGMONTGOMERY  0xC0000000

typedef uint64_t FqRawElement[Fq_N64];

#ifdef _MSC_VER
#pragma pack(push, 1)
typedef struct {
    int32_t shortVal;
    uint32_t type;
    FqRawElement longVal;
} FqElement;
#pragma pack(pop)
#else
typedef struct __attribute__((__packed__)) {
    int32_t shortVal;
    uint32_t type;
    FqRawElement longVal;
} FqElement;
#endif

typedef FqElement *PFqElement;

#endif // FQ_ELEMENT_HPP
