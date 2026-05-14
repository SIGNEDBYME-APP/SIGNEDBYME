#ifndef PLATFORM_COMPAT_HPP
#define PLATFORM_COMPAT_HPP

// Windows compatibility header for rapidsnark
// Provides POSIX/BSD type definitions and attribute macros for MSVC

#ifdef _MSC_VER

// BSD-style integer types (MSVC uses uint32_t, not u_int32_t)
#include <cstdint>
typedef uint8_t   u_int8_t;
typedef uint16_t  u_int16_t;
typedef uint32_t  u_int32_t;
typedef uint64_t  u_int64_t;

// GCC attributes are not supported by MSVC
#ifndef __attribute__
#define __attribute__(x)
#endif

// ssize_t is POSIX, not available on Windows
#include <BaseTsd.h>
typedef SSIZE_T ssize_t;

#endif // _MSC_VER

#endif // PLATFORM_COMPAT_HPP
