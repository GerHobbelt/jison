
// When you set up a custom lexer, this is the minimum example for one:
    // 
    // your lexer class/object must provide these interface methods and constants at least:
    //
    // - setInput(string)
    // - lex() -> token
    // - EOF = 1
    // - ERROR = 2
    //
    // and your lexer must have a `options` member set up as a hash table, i.e. JS object:
    //
    // - options: {}
    //
    // Your lexer must be named `lexer` as shown below.

    var input = ""; 
    var input_offset = 0; 

    var lexer = { 
        EOF: 1, 
        ERROR: 2, 

        options: {}, 

        lex: function () { 
            if (input.length > input_offset) { 
                return input[input_offset++]; 
            } else { 
                return this.EOF; 
            } 
        }, 

        setInput: function (inp) { 
            input = inp; 
            input_offset = 0; 
        } 
    };
