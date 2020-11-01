const nest = require('depnest')
const addSuggest = require('suggest-box')
const resolve = require('mutant/resolve')
const h = require('mutant/h')
const emoji = require('node-emoji')

exports.needs = nest({
  'profile.async.suggest': 'first',
  'channel.async.suggest': 'first'
})

exports.gives = nest('suggest.hook')

exports.create = function (api) {
  return nest('suggest.hook', function SuggestHook ({ participants = null } = {}) {
    const getProfileSuggestions = api.profile.async.suggest()
    const getChannelSuggestions = api.channel.async.suggest()

    return function (textArea) {
      addSuggest(textArea, (inputText, cb) => {
        if (inputText[0] === '@') {
          getProfileSuggestions(inputText.slice(1), resolve(participants), cb)
        } else if (inputText[0] === '#') {
          getChannelSuggestions(inputText.slice(1), cb)
        } else if (inputText[0] === ':') {
          // suggest emojis
          let word = inputText.slice(1)
          if (word[word.length - 1] === ':') {
            word = word.slice(0, -1)
          }
          cb(null, emoji.search(word).slice(0, 100).map(function (result) {
            // result = { key:  emoji}
            return {
              title: h('span Emoji -suggest', result.emoji),
              subtitle: result.key,
              value: result.emoji
            }
          }))
        }
      }, { cls: 'SuggestBox' })
    }
  })
}
