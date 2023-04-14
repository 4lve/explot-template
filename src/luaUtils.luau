local function assign<T, U, V, W>(target: T, source0: U?, source1: V?, source2: W?, ...): T & U & V & W
	if source0 ~= nil and typeof(source0 :: any) == "table" then
		for key, value in pairs(source0 :: any) do
			(target :: any)[key] = value
		end
	end

	if source1 ~= nil and typeof(source1 :: any) == "table" then
		for key, value in pairs(source1 :: any) do
			(target :: any)[key] = value
		end
	end

	if source2 ~= nil and typeof(source2 :: any) == "table" then
		for key, value in pairs(source2 :: any) do
			(target :: any)[key] = value
		end
	end

	for index = 1, select("#", ...) do
		local rest = select(index, ...)

		if rest ~= nil and typeof(rest) == "table" then
			for key, value in pairs(rest) do
				(target :: any)[key] = value
			end
		end
	end

	-- TODO? we can add & Object to this, if needed by real-world code, once CLI-49825 is fixed
	return (target :: any) :: T & U & V & W
end

local NaN = 0 / 0

local function charCodeAt(str: string, index: number): number
	if typeof(index) ~= "number" then
		index = 1
	end

	index += 1 -- LUA indexes start at 1

	local strLen, invalidBytePosition = utf8.len(str)
	assert(strLen ~= nil, ("string `%s` has an invalid byte at position %s"):format(str, tostring(invalidBytePosition)))
	if index > strLen or index < 1 then
		return NaN
	end

	local offset = utf8.offset(str, index)
	local value = utf8.codepoint(str, offset, offset)

	if value == nil then
		return NaN
	end

	return value
end

local function endsWith(value: string, substring: string, optionalLength: number?): boolean
	local substringLength = substring:len()
	if substringLength == 0 then
		return true
	end
	local valueLength = value:len()
	local length = optionalLength or valueLength
	if length > valueLength then
		length = valueLength
	end
	if length < 1 then
		return false
	end
	local position = length - substringLength + 1
	return value:find(substring, position, true) == position
end

local function slice(str: string, startIndexStr: string | number, lastIndexStr: (string | number)?): string
	if typeof(startIndexStr) == "number" then
		startIndexStr += 1
	end
	if typeof(lastIndexStr) == "number" then
		lastIndexStr += 1
	end
	local strLen, invalidBytePosition = utf8.len(str)
	assert(strLen ~= nil, ("string `%s` has an invalid byte at position %s"):format(str, tostring(invalidBytePosition)))
	local startIndex = tonumber(startIndexStr)
	assert(typeof(startIndex) == "number", "startIndexStr should be a number")

	if startIndex + strLen < 0 then
		-- then |start index| is greater than string length
		startIndex = 1
	end

	if startIndex > strLen then
		return ""
	end

	-- if no last index length set, go to str length + 1
	local lastIndex = strLen + 1
	if lastIndexStr ~= nil then
		-- ROBLOX FIXME: add parseInt to encapsulate this logic and use it here
		local NaN = 0 / 0
		lastIndex = tonumber(lastIndexStr) or NaN -- this works because 0 is truthy in Lua
	end
	assert(typeof(lastIndex) == "number", "lastIndexStr should convert to number")

	if lastIndex > strLen then
		lastIndex = strLen + 1
	end

	local startIndexByte = utf8.offset(str, startIndex)
	-- get char length of charset retunred at offset
	local lastIndexByte = utf8.offset(str, lastIndex) - 1

	return string.sub(str, startIndexByte, lastIndexByte)
end

type Match = {
	index: number,
	match: string,
}

local function findOr(str: string, patternTable: { string }, initIndex: number?): Match | nil
	-- loop through all options in patern patternTable

	local init = utf8.offset(str, initIndex or 1)
	local matches = {}
	for _, value in ipairs(patternTable) do
		local iStart, iEnd = string.find(str, value, init)
		if iStart then
			local prefix = string.sub(str, 1, iStart - 1)
			local prefixEnd, invalidBytePosition = utf8.len(prefix)
			if prefixEnd == nil then
				error(("string `%s` has an invalid byte at position %s"):format(prefix, tostring(invalidBytePosition)))
			end
			local iStartIndex = prefixEnd :: number + 1
			local match = {
				index = iStartIndex,
				match = string.sub(str, iStart, iEnd),
			}
			table.insert(matches, match)
		end
	end

	-- if no matches, return nil
	if #matches == 0 then
		return nil
	end

	-- find the first matched index (after the init param)
	-- for each, if we get a hit, return the earliest index and matched term

	local firstMatch
	for _, value in ipairs(matches) do
		-- load first condition
		if firstMatch == nil then
			firstMatch = value
		end
		-- identify if current match comes before first match
		if value.index < firstMatch.index then
			firstMatch = value
		end
	end

	-- return first match
	return firstMatch
end

type Array<T> = { [number]: T }

type Pattern = string | Array<string>

local function split(str: string, pattern: Pattern?): Array<string>
	if pattern == nil then
		return { str }
	end
	local patternList: Array<string>
	if typeof(pattern) == "string" then
		if pattern == "" then
			--[[ ROBLOX deviation: JS would return an array of characters ]]
			return { str }
		end
		patternList = { pattern }
	else
		patternList = pattern :: any
	end
	local init = 0
	local result = {}
	local lastMatch
	local strLen, invalidBytePosition = utf8.len(str)
	assert(strLen ~= nil, ("string `%s` has an invalid byte at position %s"):format(str, tostring(invalidBytePosition)))

	repeat
		local match = findOr(str, patternList, init)
		if match ~= nil then
			table.insert(result, slice(str, init - 1, match.index - 1))
			local matchLength = utf8.len(match.match)
			-- Luau FIXME? Luau doesn't understand that str has already been shown to be valid utf8 on line 26 and therefore won't be nil
			init = match.index + matchLength :: number
		else
			table.insert(result, slice(str, init - 1, nil))
		end
		if match ~= nil then
			lastMatch = match
		end
	until match == nil or init > strLen
	if lastMatch ~= nil then
		local lastMatchLength, invalidBytePosition_ = utf8.len(lastMatch.match)
		assert(
			lastMatchLength ~= nil,
			("string `%s` has an invalid byte at position %s"):format(lastMatch.match, tostring(invalidBytePosition_))
		)
		if lastMatch.index + lastMatchLength == strLen + 1 then
			table.insert(result, "")
		end
	end
	return result
end

local function startsWith(value: string, substring: string, position: number?): boolean
	if string.len(substring) == 0 then
		return true
	end
	-- Luau FIXME: we have to use a tmp variable, as Luau doesn't understand the logic below narrow position to `number`
	local position_
	if position == nil or position < 1 then
		position_ = 1
	else
		position_ = position
	end

	if position_ > string.len(value) then
		return false
	end
	return value:find(substring, position_, true) == position_
end

local function trimStart(source: string): string
	return (source:gsub("^[%s]+", ""))
end

local function trimEnd(source: string): string
	return (source:gsub("[%s]+$", ""))
end

local function trim(source: string): string
	return trimStart(trimEnd(source))
end

local function substr(s: string, startIndex: number, numberOfCharacters: number?): string
	startIndex += 1
	if numberOfCharacters and numberOfCharacters <= 0 then
		return ""
	end
	return string.sub(s, startIndex, numberOfCharacters and startIndex + numberOfCharacters - 1 or nil)
end

local function fromCharCode(...: Array<number>): string
	local args = { ... }
	local result = ""
	for _, value in ipairs(args) do
		result = result .. string.char(value)
	end
	return result
end

local function sprintf(format, ...)
	local args = { ... }
	print("Format", format)
	print("Sprinf", args)
	format = string.gsub(format, "%%(%d)", function(index)
		return tostring(args[tonumber(index)])
	end)
	return format
end

local function create(proto, properties)
	if type(proto) ~= "table" and type(proto) ~= "function" then
		error("Object prototype may only be an Object or null.")
	end
	local obj = {}
	setmetatable(obj, { __index = proto })
	if properties then
		for k, v in pairs(properties) do
			rawset(obj, k, v.value)
		end
	end
	return obj
end

local function charAt(str: string, index: number): string
	return string.sub(str, index + 1, index + 1)
end

--[[ Returns the position of the first occurrence of a substring.

@param searchString — The substring to search for in the string

@param position — The index at which to begin searching the String object. If omitted, search starts at the beginning of the string.
--]]
local function indexOf(str: string, searchString: string, position: number?): number
	if position == nil then
		position = 0
	end
	local index = string.find(str, searchString, position + 1, true)
	if index == nil then
		return -1
	end
	return index - 1
end

local strObj = {
	charCodeAt = charCodeAt,
	endsWith = endsWith,
	findOr = findOr,
	split = split,
	startsWith = startsWith,
	trim = trim,
	trimEnd = trimEnd,
	trimStart = trimStart,
	substr = substr,
	fromCharCode = fromCharCode,
	sprintf = sprintf,
	charAt = charAt,
	indexOf = indexOf,
	slice = slice,
}

setmetatable(strObj, {
	__call = function(tbl, str: any)
		return tostring(str)
	end,
})

local function arrSlice(array: Array, start: number, deleteCount: number?, ...): Array
	-- Append varargs without removing anything
	start += 1
	if start > #array then
		local varargCount = select("#", ...)
		for i = 1, varargCount do
			local toInsert = select(i, ...)
			table.insert(array, toInsert)
		end
		return {}
	else
		local length = #array
		-- In the JS impl, a negative fromIndex means we should use length -
		-- index; with Lua, of course, this means that 0 is still valid, but
		-- refers to the end of the array the way that '-1' would in JS
		if start < 1 then
			start = math.max(length - math.abs(start), 1)
		end

		local deletedItems = {}
		-- If no deleteCount was provided, we want to delete the rest of the
		-- array starting with `start`
		local deleteCount_: number = deleteCount or length
		if deleteCount_ > 0 then
			local lastIndex = math.min(length, start + math.max(0, deleteCount_ - 1))

			for i = start, lastIndex do
				local deleted = table.remove(array, start)
				table.insert(deletedItems, deleted)
			end
		end

		local varargCount = select("#", ...)
		-- Do this in reverse order so we can always insert in the same spot
		for i = varargCount, 1, -1 do
			local toInsert = select(i, ...)
			table.insert(array, start, toInsert)
		end

		return deletedItems
	end
end

return {
	Object = {
		assign = assign,
		create = create,
	},
	String = strObj,
	Arr = {
		slice = arrSlice,
	},
}
