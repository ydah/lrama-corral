%{
/* Simple SQL Grammar Example */
#include <stdio.h>
%}

%token SELECT FROM WHERE
%token INSERT INTO VALUES
%token UPDATE SET
%token DELETE
%token CREATE TABLE
%token INTEGER VARCHAR
%token AND OR NOT
%token IDENTIFIER NUMBER STRING
%token LPAREN RPAREN COMMA SEMICOLON
%token EQ NEQ LT GT LE GE

%%

statements: /* empty */
          | statements statement
          ;

statement: select_stmt SEMICOLON
         | insert_stmt SEMICOLON
         | update_stmt SEMICOLON
         | delete_stmt SEMICOLON
         | create_stmt SEMICOLON
         ;

select_stmt: SELECT column_list FROM IDENTIFIER
           | SELECT column_list FROM IDENTIFIER WHERE condition
           ;

insert_stmt: INSERT INTO IDENTIFIER VALUES LPAREN value_list RPAREN
           ;

update_stmt: UPDATE IDENTIFIER SET assignment_list
           | UPDATE IDENTIFIER SET assignment_list WHERE condition
           ;

delete_stmt: DELETE FROM IDENTIFIER
           | DELETE FROM IDENTIFIER WHERE condition
           ;

create_stmt: CREATE TABLE IDENTIFIER LPAREN column_defs RPAREN
           ;

column_list: IDENTIFIER
           | column_list COMMA IDENTIFIER
           ;

value_list: value
          | value_list COMMA value
          ;

value: NUMBER
     | STRING
     | IDENTIFIER
     ;

assignment_list: assignment
               | assignment_list COMMA assignment
               ;

assignment: IDENTIFIER EQ value
          ;

condition: expr
         | condition AND condition
         | condition OR condition
         | NOT condition
         | LPAREN condition RPAREN
         ;

expr: IDENTIFIER EQ value
    | IDENTIFIER NEQ value
    | IDENTIFIER LT value
    | IDENTIFIER GT value
    | IDENTIFIER LE value
    | IDENTIFIER GE value
    ;

column_defs: column_def
           | column_defs COMMA column_def
           ;

column_def: IDENTIFIER type
          ;

type: INTEGER
    | VARCHAR LPAREN NUMBER RPAREN
    ;
