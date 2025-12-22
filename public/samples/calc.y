%{
#include <stdio.h>
%}

%token NUMBER
%token PLUS MINUS TIMES DIVIDE
%token LPAREN RPAREN
%token EOL

%%

program: expr EOL { printf("Result: %d\n", $1); }
       ;

expr: term
    | expr PLUS term { $$ = $1 + $3; }
    | expr MINUS term { $$ = $1 - $3; }
    ;

term: factor
    | term TIMES factor { $$ = $1 * $3; }
    | term DIVIDE factor { $$ = $1 / $3; }
    ;

factor: NUMBER
      | LPAREN expr RPAREN { $$ = $2; }
      ;
