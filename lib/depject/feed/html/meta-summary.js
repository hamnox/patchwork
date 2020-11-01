const nest = require('depnest')
const ref = require('ssb-ref')
const { when, h, Value, computed } = require('mutant')

exports.needs = nest({
  'intl.sync.i18n': 'first',
  'intl.sync.i18n_n': 'first',
  'about.html.image': 'first',
  'about.obs.name': 'first'
})

exports.gives = nest({
  'feed.html.metaSummary': true
})

const i18nActions = {
  followed: 'followed',
  unfollowed: 'unfollowed',
  subscribed: 'subscribed to',
  unsubscribed: 'unsubscribed from',
  identified: 'identified',
  blocked: 'blocked',
  unblocked: 'unblocked'
}

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  const plural = api.intl.sync.i18n_n

  return nest('feed.html', { metaSummary })

  function metaSummary (group, renderItem, getPriority, opts) {
    const expanded = Value(false)
    const isNew = group.msgs.some(msg => getPriority(msg) > 0)
    const actions = getActions(group.msgs)
    const counts = getActionCounts(actions)
    const reduced = reduceActions(counts)

    const contentSummary = h('FeedMetaSummary', [
      reduced.map(item => {
        return h('div -' + item.action, [
          h('div -left', [item.from.slice(0, 8).map(avatarFormatter), more(item.from, 8)]),
          h('span.action', { title: actionDescription(item) }),
          h('div -right', [item.to.slice(0, 8).map(avatarFormatter), more(item.to, 8)])
        ])
      })
    ])

    return h('FeedEvent -group', {
      classList: [
        when(expanded, '-expanded'),
        when(isNew, '-new')
      ]
    }, [
      contentSummary,
      when(expanded, h('div.items', group.msgs.map(msg => renderItem(msg, opts)))),
      h('a.expand', {
        'tab-index': 0,
        'ev-click': { handleEvent: toggleValue, value: expanded }
      }, [
        when(expanded,
          [i18n('Hide details')],
          [i18n('Show details') + ' (', group.msgs.length, ')']
        )
      ])
    ])
  }

  function avatarFormatter (id) {
    if (id.startsWith('#')) {
      return h('a -channel', { href: id }, `#${ref.normalizeChannel(id)}`)
    } else {
      return h('a', { href: id }, api.about.html.image(id))
    }
  }

  function actionDescription (item) {
    if (item.from.length === item.to.length) {
      if (item.action === 'identified' && item.from[0] === item.to[0]) {
        return computed([
          getName(item.from[0])
        ], (name) => {
          return name + ' ' + i18n('updated their profile')
        })
      } else {
        return computed([
          getName(item.from[0]),
          getName(item.to[0])
        ], (a, b) => {
          return a + ' ' + i18n(i18nActions[item.action]) + ' ' + b
        })
      }
    } else if (item.from.length < item.to.length) {
      const name = getName(item.from[0])
      return computed([name, item.to.length], (name, count) => name + ' ' + i18n(i18nActions[item.action]) + ' ' + plural('%s people', count))
    } else {
      const name = getName(item.to[0])
      return computed([name, item.from.length], (name, count) => plural('%s people', count) + ' ' + i18n(i18nActions[item.action]) + ' ' + name)
    }
  }

  function getName (id) {
    return id.startsWith('#') ? id : api.about.obs.name(id)
  }
}

function more (items, max) {
  if (items.length > max) {
    return h('strong', ['+', items.length - max])
  }
}

function getActions (msgs) {
  const actions = {}

  // reduce down actions for each contact change (de-duplicate, remove redundency)
  // e.g. if a person follows someone then unfollows, ignore both actions
  msgs.forEach(msg => {
    const content = msg.value.content
    const from = msg.value.author
    if (content.type === 'contact') {
      if (ref.isFeed(content.contact)) {
        const to = content.contact
        const key = `${from}:${to}`
        if (content.following === true) {
          if (actions[key] === 'unfollowed') {
            delete actions[key]
          } else {
            actions[key] = 'followed'
          }
        } else if (content.blocking === true) {
          if (actions[key] === 'unblocked') {
            delete actions[key]
          } else {
            actions[key] = 'blocked'
          }
        } else if (content.blocking === false) {
          if (actions[key] === 'blocked') {
            delete actions[key]
          } else {
            actions[key] = 'unblocked'
          }
        } else if (content.following === false) {
          if (actions[key] === 'followed') {
            delete actions[key]
          } else {
            actions[key] = 'unfollowed'
          }
        }
      }
    } else if (content.type === 'channel') {
      const channel = ref.normalizeChannel(content.channel)
      if (channel) {
        const to = '#' + channel
        const key = `${from}:${to}`
        if (content.subscribed === true) {
          if (actions[key] === 'unsubscribed') {
            delete actions[key]
          } else {
            actions[key] = 'subscribed'
          }
        } else if (content.subscribed === false) {
          if (actions[key] === 'subscribed') {
            delete actions[key]
          } else {
            actions[key] = 'unsubscribed'
          }
        }
      }
    } else if (content.type === 'about') {
      if (ref.isFeed(content.about)) {
        const to = content.about
        const key = `${from}:${to}`
        actions[key] = 'identified'
      }
    }
  })

  return actions
}

function getActionCounts (actions) {
  const actionCounts = {}

  // get actions performed on and by profiles
  // collect who did what and has what done on them
  for (const key in actions) {
    const action = actions[key]
    const { from, to } = splitKey(key)
    actionCounts[from] = actionCounts[from] || { from: {}, to: {} }
    actionCounts[to] = actionCounts[to] || { from: {}, to: {} }

    actionCounts[from].from[action] = actionCounts[from].from[action] || []
    actionCounts[to].to[action] = actionCounts[to].to[action] || []

    actionCounts[from].from[action].push(to)
    actionCounts[to].to[action].push(from)
  }

  return actionCounts
}

function reduceActions (actionCounts) {
  const actions = []

  for (const key in actionCounts) {
    const value = actionCounts[key]
    for (const action in value.from) {
      actions.push({ from: [key], action, to: value.from[action], rank: value.from[action].length })
    }
    for (const action in value.to) {
      actions.push({ from: value.to[action], action, to: [key], rank: value.to[action].length })
    }
  }

  // sort desc by most targets per action
  actions.sort((a, b) => Math.max(b.rank - a.rank))

  // remove duplicate actions, and return!
  const used = new Set()
  return actions.filter(action => {
    // only add a particular action once!
    if (action.from.length > action.to.length) {
      action.from = action.from.filter(from => action.to.some(to => !used.has(`${from}:${to}`)))
    } else {
      action.to = action.to.filter(to => action.from.some(from => !used.has(`${from}:${to}`)))
    }

    action.from.forEach(from => {
      action.to.forEach(to => {
        used.add(`${from}:${to}`)
      })
    })

    // // only return if has targets
    return action.from.length && action.to.length
  })
}

function toggleValue () {
  this.value.set(!this.value())
}

function splitKey (key) {
  const mid = key.indexOf(':')
  return {
    from: key.slice(0, mid),
    to: key.slice(mid + 1)
  }
}
