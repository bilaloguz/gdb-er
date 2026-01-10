
#include <stdio.h>

// Buggy factorial: Infinite recursion potential or wrong base case
int factorial(int n) {
    printf("factorial(%d)\n", n);
    if (n == 0) return 0; // BUG: Should return 1
    return n * factorial(n - 1);
}

int main() {
    int num = 5;
    printf("Calculating factorial of %d\n", num);
    int result = factorial(num);
    printf("Result: %d\n", result); // Will be 0
    return 0;
}
