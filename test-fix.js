} else if (text.match(/^\d+(?:\.\d+)?%$/) && parseFloat(text.replace(/%/g, '')) <= 100) {
                  difficulties.push(parseFloat(text.replace(/%/g, '')));
                } else if (text.match(/^\$\d+(?:\.\d+)?$/)) {
                  cpcs.push(parseFloat(text.replace(/$/g, '')));
                } else if (!text.includes('$') && !text.includes('%') && !text.includes(',') &&
                          !text.match(/^\d+$/) && text.split(' ').length <= 10) {
                  keywordsFound.push(text);
                }
