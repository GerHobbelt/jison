
// unescape the escapes specific to a string value which is wrapped in singlequotes
export default function unescSingleQuote(str) {
    str = '' + str;
    let a = str.split('\\\\');
    a = a.map(function (s) {
        return s.replace(/\\'/g, '\'');
    });
    str = a.join('\\\\');
    return str;
}

