String.prototype.format = function () {
  let formatted = this;
  for (let i = 0; i < arguments.length; i++) {
    let regexp = new RegExp('\\{' + i + '\\}', 'gi');
    formatted = formatted.replace(regexp, arguments[i]);
  }
  return formatted;
};

module.exports = {
  cleanString (str) {
    return str.replace(/[^A-Za-z0-9: \-_,]/g, '');
  },
  
  cleanChatString (str) {
    return str.replace('ä', 'a').replace('ö', 'o').replace(/[^A-Za-z0-9:<>.?! \-_,]/g, '');
  }
};