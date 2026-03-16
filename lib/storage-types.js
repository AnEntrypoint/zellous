/**
 * @typedef {Object} StorageUser
 * @property {string} id
 * @property {string} username
 * @property {string} displayName
 * @property {string} [passwordSalt]
 * @property {string} [passwordHash]
 * @property {number} createdAt
 * @property {number} lastLoginAt
 * @property {Array<Object>} devices
 * @property {Object} settings
 */

/**
 * @typedef {Object} StorageSession
 * @property {string} id
 * @property {string} userId
 * @property {string} [deviceId]
 * @property {number} createdAt
 * @property {number} lastActivityAt
 * @property {number} expiresAt
 */

/**
 * @typedef {Object} StorageRoom
 * @property {string} id
 * @property {number} createdAt
 * @property {number} lastActivityAt
 * @property {number} userCount
 * @property {Array<Object>} channels
 * @property {Array<Object>} categories
 */

/**
 * @typedef {Object} StorageMessage
 * @property {string} id
 * @property {string} roomId
 * @property {string} channelId
 * @property {string} userId
 * @property {string} username
 * @property {string} type
 * @property {string} content
 * @property {number} timestamp
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} StorageFile
 * @property {string} id
 * @property {string} originalName
 * @property {string} storedName
 * @property {string} path
 * @property {number} size
 * @property {string} uploadedBy
 * @property {number} uploadedAt
 * @property {string} mimeType
 */

/**
 * @typedef {Object} UsersAdapter
 * @property {function(string, string, string=): Promise<StorageUser>} create
 * @property {function(string): Promise<StorageUser|null>} findByUsername
 * @property {function(string): Promise<StorageUser|null>} findById
 * @property {function(string, Object): Promise<StorageUser>} update
 * @property {function(string, string): Promise<StorageUser|null>} authenticate
 * @property {function(string, Object): Promise<Object>} addDevice
 * @property {function(string): Promise<Array<Object>>} getDevices
 * @property {function(string, string): Promise<boolean>} removeDevice
 */

/**
 * @typedef {Object} SessionsAdapter
 * @property {function(string, string=): Promise<StorageSession>} create
 * @property {function(string): Promise<StorageSession|null>} findById
 * @property {function(string, Object): Promise<StorageSession>} update
 * @property {function(string): Promise<StorageSession>} touch
 * @property {function(string): Promise<boolean>} delete
 * @property {function(string): Promise<Array<StorageSession>>} findByUserId
 * @property {function(string): Promise<StorageSession|null>} validate
 */

/**
 * @typedef {Object} RoomsAdapter
 * @property {function(string): Promise<StorageRoom>} ensureRoom
 * @property {function(string): Promise<StorageRoom|null>} getMeta
 * @property {function(string, Object): Promise<StorageRoom>} updateMeta
 * @property {function(string, number): Promise<StorageRoom>} setUserCount
 * @property {function(string): Promise<void>} scheduleCleanup
 * @property {function(string): Promise<void>} cancelCleanup
 * @property {function(): Promise<void>} processCleanups
 * @property {function(string): Promise<void>} cleanup
 * @property {function(string): Promise<Array<Object>>} getChannels
 * @property {function(string): Promise<Array<Object>>} getCategories
 */

/**
 * @typedef {Object} MessagesAdapter
 * @property {function(string, Object): Promise<StorageMessage>} save
 * @property {function(string, number, number=, string=): Promise<Array<StorageMessage>>} getRecent
 * @property {function(string, string): Promise<StorageMessage|null>} getById
 * @property {function(string, string): Promise<boolean>} remove
 * @property {function(string, string, Object): Promise<StorageMessage|null>} update
 */

/**
 * @typedef {Object} MediaAdapter
 * @property {function(string, string, string, *, string): Promise<void>} saveChunk
 * @property {function(string, string, string): Promise<string>} createSession
 * @property {function(string, string): Promise<void>} endSession
 */

/**
 * @typedef {Object} FilesAdapter
 * @property {function(string, string, string, Buffer, string=): Promise<StorageFile>} save
 * @property {function(string, string): Promise<{filepath: string, meta: StorageFile}|null>} get
 * @property {function(string, string=): Promise<Array<Object>>} list
 * @property {function(string, string): Promise<boolean>} delete
 */

/**
 * @typedef {Object} StorageAdapter
 * @property {function(): Promise<void>} init - Initialize the storage backend
 * @property {UsersAdapter} users
 * @property {SessionsAdapter} sessions
 * @property {RoomsAdapter} rooms
 * @property {MessagesAdapter} messages
 * @property {MediaAdapter} media
 * @property {FilesAdapter} files
 * @property {Object} [servers]
 * @property {Object} [bots]
 */
