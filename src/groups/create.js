"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const meta_1 = __importDefault(require("../meta"));
const plugins_1 = __importDefault(require("../plugins"));
const slugify_1 = __importDefault(require("../slugify"));
const database_1 = __importDefault(require("../database"));
module.exports = function (Groups) {
    Groups.create = function (data) {
        return __awaiter(this, void 0, void 0, function* () {
            function isSystemGroup(data) {
                return data.system === true || (typeof data.system === 'number' && data.system === 1) ||
                    Groups.systemGroups.includes(data.name) ||
                    Groups.isPrivilegeGroup(data.name);
            }
            const isSystem = isSystemGroup(data);
            const timestamp = data.timestamp || Date.now();
            const disableJoinRequestsString = typeof data.disableJoinRequests === 'string' ? data.disableJoinRequests : '0';
            const disableJoinRequests = parseInt(disableJoinRequestsString, 10) === 1 ? 1 : 0;
            const disableLeaveString = typeof data.disableLeave === 'string' ? data.disableLeave : '0';
            const disableLeave = parseInt(disableLeaveString, 10) === 1 ? 1 : 0;
            const isHidden = (typeof data.hidden === 'string') ?
                (parseInt(data.hidden, 10) === 1) : false;
            Groups.validateGroupName(data.name);
            const exists = yield meta_1.default.userOrGroupExists(data.name);
            if (exists) {
                throw new Error('[[error:group-already-exists]]');
            }
            const memberCount = data.hasOwnProperty('ownerUid') ? 1 : 0;
            const isPrivate = data.hasOwnProperty('private') ? (parseInt(data.private.toString(), 10) === 1) : true;
            const userTitleEnabledString = typeof data.userTitleEnabled === 'string' ? data.userTitleEnabled : '0';
            let groupData = {
                name: data.name,
                slug: (0, slugify_1.default)(data.name),
                createtime: timestamp,
                userTitle: data.userTitle || data.name,
                userTitleEnabled: parseInt(userTitleEnabledString, 10) === 1 ? 1 : 0,
                description: data.description || '',
                memberCount: memberCount,
                hidden: isHidden ? 1 : 0,
                system: isSystem ? 1 : 0,
                private: isPrivate ? 1 : 0,
                disableJoinRequests: disableJoinRequests,
                disableLeave: disableLeave,
            };
            yield plugins_1.default.hooks.fire('filter:group.create', { group: groupData, data: data });
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.sortedSetAdd('groups:createtime', groupData.createtime, groupData.name);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.setObject(`group:${groupData.name}`, groupData);
            if (data.hasOwnProperty('ownerUid')) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield database_1.default.setAdd(`group:${groupData.name}:owners`, data.ownerUid.toString());
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield database_1.default.sortedSetAdd(`group:${groupData.name}:members`, timestamp, data.ownerUid.toString());
            }
            if (!isHidden && !isSystem) {
                const sortedSetAddBulkData = [
                    ['groups:visible:createtime', timestamp, groupData.name],
                    ['groups:visible:memberCount', groupData.memberCount, groupData.name],
                    ['groups:visible:name', 0, `${groupData.name.toLowerCase()}:${groupData.name}`],
                ];
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                yield database_1.default.sortedSetAddBulk(sortedSetAddBulkData);
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield database_1.default.setObjectField('groupslug:groupname', groupData.slug, groupData.name);
            groupData = yield Groups.getGroupData(groupData.name);
            try {
                yield plugins_1.default.hooks.fire('action:group.create', { group: groupData });
            }
            catch (error) {
                console.error('Error occurred during action:group.create:', error);
            }
            return groupData;
        });
    };
    Groups.validateGroupName = function (name) {
        if (!name) {
            throw new Error('[[error:group-name-too-short]]');
        }
        if (typeof name !== 'string') {
            throw new Error('[[error:invalid-group-name]]');
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        if (!Groups.isPrivilegeGroup(name) && name.length > meta_1.default.config.maximumGroupNameLength) {
            throw new Error('[[error:group-name-too-long]]');
        }
        if (name === 'guests' || (!Groups.isPrivilegeGroup(name) && name.includes(':'))) {
            throw new Error('[[error:invalid-group-name]]');
        }
        if (name.includes('/') || !(0, slugify_1.default)(name)) {
            throw new Error('[[error:invalid-group-name]]');
        }
    };
};
