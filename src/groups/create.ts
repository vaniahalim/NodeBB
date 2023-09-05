import meta from '../meta';
import plugins from '../plugins';
import slugify from '../slugify';
import db from '../database';

interface GroupData {
    name: string;
    slug: string;
    createtime: number;
    userTitle: string;
    userTitleEnabled: number;
    description: string;
    memberCount: number;
    hidden: number;
    system: number;
    private: number;
    disableJoinRequests: number;
    disableLeave: number;
}

interface GroupsStatic {
    create(data: GroupsInstance): Promise<GroupData>;
    validateGroupName(name: string): void;
    getGroupData(name: string): Promise<GroupData>;
    systemGroups: string[];
    isPrivilegeGroup(name: string): boolean;
}

interface GroupsInstance {
    system: boolean | number;
    ownerUid?: number;
    private?: boolean | number;
    name: string;
    timestamp?: number;
    disableJoinRequests?: string | number;
    disableLeave?: string | number;
    userTitle?: string;
    userTitleEnabled: string | number;
    description?: string;
    hidden: string | number;
    exists: boolean;
    slug: string;
}

export = function (Groups: GroupsStatic) {
    Groups.create = async function (data: GroupsInstance) {
        function isSystemGroup(data: GroupsInstance): boolean {
            return data.system === true || (typeof data.system === 'number' && data.system === 1) ||
                Groups.systemGroups.includes(data.name) ||
                Groups.isPrivilegeGroup(data.name);
        }
        const isSystem = isSystemGroup(data);
        const timestamp = data.timestamp || Date.now();
        const disableJoinRequestsString =
        typeof data.disableJoinRequests === 'string' ? data.disableJoinRequests : '0';
        const disableJoinRequests: number =
            parseInt(disableJoinRequestsString, 10) === 1 ? 1 : 0;
        const disableLeaveString =
            typeof data.disableLeave === 'string' ? data.disableLeave : '0';
        const disableLeave: number =
            parseInt(disableLeaveString, 10) === 1 ? 1 : 0;

        const isHidden: boolean = (typeof data.hidden === 'string') ?
            (parseInt(data.hidden, 10) === 1) : false;

        Groups.validateGroupName(data.name);

        const exists = await meta.userOrGroupExists(data.name) as boolean;
        if (exists) {
            throw new Error('[[error:group-already-exists]]');
        }

        const memberCount = data.hasOwnProperty('ownerUid') ? 1 : 0;
        const isPrivate = data.hasOwnProperty('private') ? (parseInt(data.private.toString(), 10) === 1) : true;
        const userTitleEnabledString = typeof data.userTitleEnabled === 'string' ? data.userTitleEnabled : '0';
        let groupData: GroupData = {
            name: data.name,
            slug: slugify(data.name) as string,
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

        await plugins.hooks.fire('filter:group.create', { group: groupData, data: data });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetAdd('groups:createtime', groupData.createtime, groupData.name);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObject(`group:${groupData.name}`, groupData);

        if (data.hasOwnProperty('ownerUid')) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await db.setAdd(`group:${groupData.name}:owners`, data.ownerUid.toString());
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await db.sortedSetAdd(`group:${groupData.name}:members`, timestamp, data.ownerUid.toString());
        }

        if (!isHidden && !isSystem) {
            const sortedSetAddBulkData = [
                ['groups:visible:createtime', timestamp, groupData.name],
                ['groups:visible:memberCount', groupData.memberCount, groupData.name],
                ['groups:visible:name', 0, `${groupData.name.toLowerCase()}:${groupData.name}`],
            ];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            await db.sortedSetAddBulk(sortedSetAddBulkData);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.setObjectField('groupslug:groupname', groupData.slug, groupData.name);

        groupData = await Groups.getGroupData(groupData.name);
        try {
            await plugins.hooks.fire('action:group.create', { group: groupData });
        } catch (error) {
            console.error('Error occurred during action:group.create:', error);
        }
        return groupData;
    };

    Groups.validateGroupName = function (name: string) {
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
}
// help from ChatGPT
