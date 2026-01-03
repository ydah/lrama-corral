%{
/* Simple grammar example */
%}

%token WORD
%token NEWLINE

%%

input: /* empty */
     | input line
     ;

line: NEWLINE
    | statement NEWLINE
    ;

statement: WORD
         | statement WORD
         ;
