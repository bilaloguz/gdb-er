
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void cause_segfault() {
    int *ptr = NULL;
    printf("About to dereference NULL pointer...\n");
    *ptr = 42; // CRASH
}

void buffer_overflow() {
    char buffer[10];
    printf("About to overflow buffer...\n");
    strcpy(buffer, "This string is definitely too long for the buffer");
}

int main(int argc, char *argv[]) {
    printf("Crash Test Program Started\n");
    
    if (argc > 1 && strcmp(argv[1], "overflow") == 0) {
        buffer_overflow();
    } else {
        cause_segfault();
    }
    
    return 0;
}
