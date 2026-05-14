#ifndef RANDOM_GENERATOR_H
#define RANDOM_GENERATOR_H

#ifdef USE_SODIUM

#include <sodium.h>

#else

#include <random>
#include <cstdint>

inline void
randombytes_buf(void * const buf, const size_t size)
{
    std::random_device engine;
    // Note: MSVC doesn't allow uint8_t as template parameter for uniform_int_distribution
    // Use unsigned int and cast the result
    std::uniform_int_distribution<unsigned int> distr(0, 255);

    uint8_t *buffer = static_cast<uint8_t*>(buf);

    for(size_t i = 0; i < size; i++) {
        buffer[i] = static_cast<uint8_t>(distr(engine));
    }
}

#endif //USE_SODIUM

#endif // RANDOM_GENERATOR_H
