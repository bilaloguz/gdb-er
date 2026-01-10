
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int id;
    char name[32];
    struct Node *next;
} Node;

Node* create_node(int id, const char* name) {
    Node* n = (Node*)malloc(sizeof(Node));
    n->id = id;
    snprintf(n->name, 32, "%s", name);
    n->next = NULL;
    return n;
}

int main() {
    printf("Building Linked List...\n");
    
    Node* head = create_node(1, "Head");
    Node* second = create_node(2, "Middle");
    Node* third = create_node(3, "Tail");
    
    head->next = second;
    second->next = third;
    
    printf("List Linked.\n");
    
    Node* current = head;
    while(current) {
        printf("Node %d: %s\n", current->id, current->name);
        current = current->next; // STEP HERE to watch 'current' change
    }
    
    return 0;
}
