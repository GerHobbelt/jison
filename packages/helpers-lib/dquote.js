
// properly quote and escape the given input string
export default function dquote(s) {
    let sq = (s.indexOf('\'') >= 0);
    let dq = (s.indexOf('"') >= 0);
    if (sq && dq) {
        s = s.replace(/"/g, '\\"');
        dq = false;
    }
    if (dq) {
        s = '\'' + s + '\'';
    } else {
        s = '"' + s + '"';
    }
    return s;
}


