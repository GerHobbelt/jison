//
// title: "regression for bare action chunks containing | pipe symbol"
// test_input: a b c d 0; a
//
// ...
//

%%

// pathological example of spreading a bit-wise OR across multiple lines,
// just trying to thwart the lexer into "recognizing" a 'rule alternate' |-pipe symbol:

a           yytext += '7' 
        |
            0;
            return 'A';

b       return 7 | 40;

c 
        return 'C';

<<EOF>>                         return 'EOF';