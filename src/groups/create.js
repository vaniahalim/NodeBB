"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const meta = __importStar(require("../meta"));
const plugins = __importStar(require("../plugins"));
const slugify = __importStar(require("../slugify"));
const db = __importStar(require("../database"));
const Groups = {};
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
        const exists = yield meta.userOrGroupExists(data.name);
        if (exists) {
            throw new Error('[[error:group-already-exists]]');
        }
        const memberCount = data.hasOwnProperty('ownerUid') ? 1 : 0;
        const isPrivate = data.hasOwnProperty('private') ? (parseInt(data.private.toString(), 10) === 1) : true;
        const userTitleEnabledString = typeof data.userTitleEnabled === 'string' ? data.userTitleEnabled : '0';
        let groupData = {
            name: data.name,
            slug: slugify(data.name),
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
        yield plugins.hooks.fire('filter:group.create', { group: groupData, data: data });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        yield db.sortedSetAdd('groups:createtime', groupData.createtime, groupData.name);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        yield db.setObject(`group:${groupData.name}`, groupData);
        if (data.hasOwnProperty('ownerUid')) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield db.setAdd(`group:${groupData.name}:owners`, data.ownerUid.toString());
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield db.sortedSetAdd(`group:${groupData.name}:members`, timestamp, data.ownerUid.toString());
        }
        if (!isHidden && !isSystem) {
            const sortedSetAddBulkData = [
                ['groups:visible:createtime', timestamp, groupData.name],
                ['groups:visible:memberCount', groupData.memberCount, groupData.name],
                ['groups:visible:name', 0, `${groupData.name.toLowerCase()}:${groupData.name}`],
            ];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield db.sortedSetAddBulk(sortedSetAddBulkData);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        yield db.setObjectField('groupslug:groupname', groupData.slug, groupData.name);
        groupData = yield Groups.getGroupData(groupData.name);
        try {
            yield plugins.hooks.fire('action:group.create', { group: groupData });
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
    if (!Groups.isPrivilegeGroup(name) && name.length > meta.config.maximumGroupNameLength) {
        throw new Error('[[error:group-name-too-long]]');
    }
    if (name === 'guests' || (!Groups.isPrivilegeGroup(name) && name.includes(':'))) {
        throw new Error('[[error:invalid-group-name]]');
    }
    if (name.includes('/') || !slugify(name)) {
        throw new Error('[[error:invalid-group-name]]');
    }
};
exports.default = Groups;
// converted with help from ChatGPT
