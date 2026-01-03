%{
/* Grammar demonstrating operator precedence and associativity */
#include <stdio.h>
%}

%token NUMBER IDENTIFIER
%token LPAREN RPAREN
%token SEMICOLON

/* Operator precedence and associativity */
%left OR                    /* Lowest precedence */
%left AND
%left EQ NEQ
%left LT GT LE GE
%left PLUS MINUS
%left TIMES DIVIDE MOD
%right POWER                /* Right associative */
%right NOT UMINUS           /* Unary operators */
%left DOT                   /* Member access (highest precedence) */

%%

program: statements
       ;

statements: /* empty */
          | statements statement
          ;

statement: expr SEMICOLON
         ;

expr: NUMBER
    | IDENTIFIER
    | expr PLUS expr        /* Addition: left associative */
    | expr MINUS expr       /* Subtraction: left associative */
    | expr TIMES expr       /* Multiplication: left associative */
    | expr DIVIDE expr      /* Division: left associative */
    | expr MOD expr         /* Modulo: left associative */
    | expr POWER expr       /* Exponentiation: right associative */
    | expr LT expr          /* Less than */
    | expr GT expr          /* Greater than */
    | expr LE expr          /* Less than or equal */
    | expr GE expr          /* Greater than or equal */
    | expr EQ expr          /* Equal */
    | expr NEQ expr         /* Not equal */
    | expr AND expr         /* Logical AND */
    | expr OR expr          /* Logical OR */
    | NOT expr              /* Logical NOT: right associative */
    | MINUS expr %prec UMINUS  /* Unary minus */
    | LPAREN expr RPAREN    /* Grouping */
    | expr DOT IDENTIFIER   /* Member access */
    ;
