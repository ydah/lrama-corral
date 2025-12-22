%{
// Prologue section - C code before grammar rules
#include <stdio.h>

// Note: Lrama does not support epilogue section (code after second %%)
// All C code must be in the prologue section
void yyerror(const char *s);
int yylex(void);
%}

%token NUM PLUS MINUS MUL DIV LPAREN RPAREN EOL

%%

expr: term
    | expr PLUS term
    | expr MINUS term
    ;

term: factor
    | term MUL factor
    | term DIV factor
    ;

factor: NUM
      | LPAREN expr RPAREN
      ;
