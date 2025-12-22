%{
/* Simple Programming Language Grammar */
#include <stdio.h>
%}

%token IF ELSE WHILE FOR
%token FUNCTION RETURN
%token VAR LET CONST
%token IDENTIFIER NUMBER STRING
%token LPAREN RPAREN LBRACE RBRACE
%token SEMICOLON COMMA
%token ASSIGN
%token PLUS MINUS TIMES DIVIDE MOD
%token EQ NEQ LT GT LE GE
%token AND OR NOT

%left OR
%left AND
%left EQ NEQ
%left LT GT LE GE
%left PLUS MINUS
%left TIMES DIVIDE MOD
%right NOT
%right ASSIGN

%%

program: statements
       ;

statements: /* empty */
          | statements statement
          ;

statement: var_decl SEMICOLON
         | assignment SEMICOLON
         | if_stmt
         | while_stmt
         | for_stmt
         | function_decl
         | return_stmt SEMICOLON
         | expr_stmt SEMICOLON
         | block
         ;

var_decl: VAR IDENTIFIER
        | VAR IDENTIFIER ASSIGN expr
        | LET IDENTIFIER ASSIGN expr
        | CONST IDENTIFIER ASSIGN expr
        ;

assignment: IDENTIFIER ASSIGN expr
          ;

if_stmt: IF LPAREN expr RPAREN statement
       | IF LPAREN expr RPAREN statement ELSE statement
       ;

while_stmt: WHILE LPAREN expr RPAREN statement
          ;

for_stmt: FOR LPAREN for_init SEMICOLON expr SEMICOLON expr RPAREN statement
        ;

for_init: /* empty */
        | var_decl
        | assignment
        ;

function_decl: FUNCTION IDENTIFIER LPAREN param_list RPAREN block
             ;

param_list: /* empty */
          | IDENTIFIER
          | param_list COMMA IDENTIFIER
          ;

return_stmt: RETURN
           | RETURN expr
           ;

expr_stmt: expr
         ;

block: LBRACE statements RBRACE
     ;

expr: primary
    | expr PLUS expr
    | expr MINUS expr
    | expr TIMES expr
    | expr DIVIDE expr
    | expr MOD expr
    | expr EQ expr
    | expr NEQ expr
    | expr LT expr
    | expr GT expr
    | expr LE expr
    | expr GE expr
    | expr AND expr
    | expr OR expr
    | NOT expr
    | MINUS expr
    | LPAREN expr RPAREN
    | function_call
    ;

primary: IDENTIFIER
       | NUMBER
       | STRING
       ;

function_call: IDENTIFIER LPAREN arg_list RPAREN
             ;

arg_list: /* empty */
        | expr
        | arg_list COMMA expr
        ;
