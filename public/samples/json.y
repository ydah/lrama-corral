%{
/* JSON grammar example */
#include <stdio.h>
%}

%token STRING NUMBER TRUE FALSE NULL_TOKEN
%token LBRACE RBRACE LBRACKET RBRACKET
%token COLON COMMA

%%

json: value
    ;

value: STRING
     | NUMBER
     | object
     | array
     | TRUE
     | FALSE
     | NULL_TOKEN
     ;

object: LBRACE RBRACE
      | LBRACE members RBRACE
      ;

members: pair
       | members COMMA pair
       ;

pair: STRING COLON value
    ;

array: LBRACKET RBRACKET
     | LBRACKET elements RBRACKET
     ;

elements: value
        | elements COMMA value
        ;
