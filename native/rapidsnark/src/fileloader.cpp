#ifdef _WIN32
// Windows implementation
#include <windows.h>
#include <stdexcept>
#include <system_error>

#include "fileloader.hpp"

namespace BinFileUtils {

FileLoader::FileLoader()
    : fd(-1), hFile(INVALID_HANDLE_VALUE), hMapping(NULL)
{
}

FileLoader::FileLoader(const std::string& fileName)
    : fd(-1), hFile(INVALID_HANDLE_VALUE), hMapping(NULL)
{
    load(fileName);
}

void FileLoader::load(const std::string& fileName)
{
    if (hFile != INVALID_HANDLE_VALUE) {
        throw std::invalid_argument("file already loaded");
    }

    hFile = CreateFileA(
        fileName.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ,
        NULL,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        NULL
    );

    if (hFile == INVALID_HANDLE_VALUE) {
        throw std::system_error(GetLastError(), std::system_category(), "CreateFile");
    }

    LARGE_INTEGER fileSize;
    if (!GetFileSizeEx(hFile, &fileSize)) {
        CloseHandle(hFile);
        hFile = INVALID_HANDLE_VALUE;
        throw std::system_error(GetLastError(), std::system_category(), "GetFileSizeEx");
    }

    size = static_cast<size_t>(fileSize.QuadPart);

    hMapping = CreateFileMappingA(
        hFile,
        NULL,
        PAGE_READONLY,
        0,
        0,
        NULL
    );

    if (hMapping == NULL) {
        CloseHandle(hFile);
        hFile = INVALID_HANDLE_VALUE;
        throw std::system_error(GetLastError(), std::system_category(), "CreateFileMapping");
    }

    addr = MapViewOfFile(
        hMapping,
        FILE_MAP_READ,
        0,
        0,
        0
    );

    if (addr == NULL) {
        CloseHandle(hMapping);
        CloseHandle(hFile);
        hMapping = NULL;
        hFile = INVALID_HANDLE_VALUE;
        throw std::system_error(GetLastError(), std::system_category(), "MapViewOfFile");
    }
}

FileLoader::~FileLoader()
{
    if (addr != NULL) {
        UnmapViewOfFile(addr);
    }
    if (hMapping != NULL) {
        CloseHandle(hMapping);
    }
    if (hFile != INVALID_HANDLE_VALUE) {
        CloseHandle(hFile);
    }
}

} // Namespace

#else
// POSIX implementation (Linux, macOS)
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <system_error>
#include <stdexcept>

#include "fileloader.hpp"

namespace BinFileUtils {

FileLoader::FileLoader()
    : fd(-1)
{
}

FileLoader::FileLoader(const std::string& fileName)
    : fd(-1)
{
    load(fileName);
}

void FileLoader::load(const std::string& fileName)
{
    if (fd != -1) {
        throw std::invalid_argument("file already loaded");
    }

    struct stat sb;

    fd = open(fileName.c_str(), O_RDONLY);
    if (fd == -1)
        throw std::system_error(errno, std::generic_category(), "open");


    if (fstat(fd, &sb) == -1) {          /* To obtain file size */
        close(fd);
        throw std::system_error(errno, std::generic_category(), "fstat");
    }

    size = sb.st_size;

    addr = mmap(nullptr, size, PROT_READ, MAP_PRIVATE, fd, 0);

    if (addr == MAP_FAILED) {
        close(fd);
        throw std::system_error(errno, std::generic_category(), "mmap failed");
    }

    madvise(addr, size, MADV_SEQUENTIAL);
}

FileLoader::~FileLoader()
{
    if (fd != -1) {
        munmap(addr, size);
        close(fd);
    }
}

} // Namespace

#endif // _WIN32
