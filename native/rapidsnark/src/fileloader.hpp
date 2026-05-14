#ifndef FILELOADER_HPP
#define FILELOADER_HPP

#include <cstddef>
#include <string>

#ifdef _WIN32
#include <windows.h>
#endif

namespace BinFileUtils {

class FileLoader
{
public:
    FileLoader();
    FileLoader(const std::string& fileName);
    ~FileLoader();

    void load(const std::string& fileName);

    void*  dataBuffer() { return addr; }
    size_t dataSize() const { return size; }

    std::string dataAsString() { return std::string((char*)addr, size); }

private:
    void*   addr;
    size_t  size;
#ifdef _WIN32
    HANDLE  hFile;
    HANDLE  hMapping;
#endif
    int     fd;
};

}

#endif // FILELOADER_HPP
