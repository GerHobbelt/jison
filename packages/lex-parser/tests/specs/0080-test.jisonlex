//
// title: "one form of lexer regex [...] set which encompasses *all* characters, used often in JavaScript circles."
// test_input: 'a [\u14a7"\nNL\tbecky foo[bar]] b'
//
// ...
//

%%
"["[^]"]" -> 'GOOD_REGEX' // [^] matches ANY char...