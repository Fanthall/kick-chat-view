import {
	Button,
	Input,
	Listbox,
	ListboxItem,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	useDisclosure,
} from "@nextui-org/react";
import React, { FunctionComponent, useEffect, useState } from "react";
import { FaTrashAlt } from "react-icons/fa";
import {
	appendGitHubData,
	fetchGitHubData,
	removeGitHubData,
} from "../../services/githubAccessHandle";
interface SettingsProps {}
const Settings: FunctionComponent<SettingsProps> = (props) => {
	const [channelName, setChannelName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [showErrorMessage, setShowErrorMessage] = useState<boolean>(false);
	const [susUsers, setSusUsers] = useState<string[]>([]);
	const [blockEmotes, setBlockEmotes] = useState<string[]>([]);
	const [susUser, setSusUser] = useState<string>("");
	const [blockEmote, setBlockEmote] = useState<string>("");
	const [openModalSusUser, setOpenModalSusUser] = useState<boolean>(false);
	const [openModalBlockEmote, setOpenModalBlockEmote] =
		useState<boolean>(false);

	const { isOpen, onOpen, onOpenChange } = useDisclosure();

	useEffect(() => {
		const channelName = localStorage.getItem("channelName");
		const username = localStorage.getItem("username");
		const susUsers = localStorage.getItem("susUsers");
		const blockEmotes = localStorage.getItem("blockEmotes");
		if (username) setUsername(username);
		if (channelName) setChannelName(channelName);
		fetchGitHubData().then((res) => {
			setSusUsers(res);
		});
		if (blockEmotes) setBlockEmotes(JSON.parse(blockEmotes));
	}, []);

	const openAddModal = (
		<Modal
			isOpen={isOpen}
			placement="center"
			onOpenChange={() => {
				onOpenChange();
				openModalSusUser && setOpenModalSusUser(false);
				openModalBlockEmote && setOpenModalBlockEmote(false);
			}}
		>
			<ModalContent>
				{(onClose) => (
					<>
						<ModalHeader className="flex flex-col gap-1">
							{openModalSusUser && "Block User"}
							{openModalBlockEmote && "Block Emote"}
						</ModalHeader>
						<ModalBody>
							<Input
								size="sm"
								label={openModalSusUser ? "Block User" : "Block Emote"}
								value={openModalSusUser ? susUser : blockEmote}
								onChange={(val) => {
									openModalSusUser
										? setSusUser(val.target.value)
										: setBlockEmote(val.target.value);
								}}
							/>
						</ModalBody>
						<ModalFooter>
							<Button color="danger" variant="light" onPress={onClose}>
								Close
							</Button>
							<Button
								color="primary"
								onPress={() => {
									onClose();
									let newArray;

									if (openModalBlockEmote) {
										newArray = [...blockEmotes, blockEmote];
										setBlockEmotes(newArray);
									}
									if (openModalSusUser) {
										appendGitHubData(susUser);
										setSusUsers([...susUsers, susUser]);
									} else {
										localStorage.setItem(
											"blockEmotes",
											JSON.stringify(newArray)
										);
									}
								}}
							>
								Save
							</Button>
						</ModalFooter>
					</>
				)}
			</ModalContent>
		</Modal>
	);

	return (
		<>
			<div className="w-full h-full flex flex-row justify-center items-start flex-wrap">
				<div className="flex flex-col justify-start items-start">
					<div style={{ width: 250, margin: 5 }}>
						<Input
							size="sm"
							label="Channel Name"
							value={channelName}
							onChange={(val) => {
								setShowErrorMessage(false);
								setChannelName(val.target.value);
							}}
							errorMessage={
								showErrorMessage && channelName === ""
									? "Please fill the channel name"
									: undefined
							}
						/>
					</div>
					<div style={{ width: 250, margin: 5 }}>
						<Input
							size="sm"
							label="Username"
							value={username}
							onChange={(val) => {
								setShowErrorMessage(false);
								setUsername(val.target.value);
							}}
							errorMessage={
								showErrorMessage && username === ""
									? "Please fill the username"
									: undefined
							}
						/>
					</div>
				</div>
				<div className="flex flex-col justify-start items-start">
					<div
						style={{
							width: 500,
							margin: 5,
							backgroundColor: "rgba(0,0,0,0.6)",
							borderRadius: 10,
							border: "1px solid rgba(125,125,125,.5)",
						}}
					>
						<div className="flex flex-row justify-between item-center m-2">
							<div>Blocked Emotes</div>
							<div className="flex flex-row justify-between item-center">
								<Button
									color="secondary"
									size="sm"
									onPress={() => {
										setOpenModalBlockEmote(true);
										onOpen();
									}}
								>
									Add
								</Button>
							</div>
						</div>
						<Listbox
							aria-label="Actions"
							style={{
								paddingLeft: 8,
								paddingRight: 22,
							}}
						>
							{blockEmotes.map((item, index) => {
								return (
									<ListboxItem
										key="new"
										style={{
											backgroundColor: "rgba(0,0,0,0.4)",
											borderBottom: "1px solid rgba(125,125,125,.5)",
											borderRadius: 2,
										}}
									>
										<div className="flex flex-row justify-between items-center">
											<div>{item}</div>
											<div>
												<Button
													size="sm"
													isIconOnly
													color="danger"
													aria-label="Like"
													onClick={() => {
														blockEmotes.splice(index, 1);
														localStorage.setItem(
															"blockEmotes",
															JSON.stringify(blockEmotes)
														);
														setBlockEmotes([...blockEmotes]);
													}}
												>
													<FaTrashAlt size={16} />
												</Button>
											</div>
										</div>
									</ListboxItem>
								);
							})}
						</Listbox>
					</div>
				</div>
				<div className=" flex flex-col justify-start items-start">
					<div
						style={{
							width: 500,
							margin: 5,
							backgroundColor: "rgba(0,0,0,0.6)",
							borderRadius: 10,
							border: "1px solid rgba(125,125,125,.5)",
						}}
					>
						<div className="flex flex-row justify-between item-center m-2">
							<div>Suspicious Users</div>
							<div className="flex flex-row justify-between item-center">
								<Button
									color="secondary"
									size="sm"
									onPress={() => {
										setOpenModalSusUser(true);
										onOpen();
									}}
								>
									Add
								</Button>
							</div>
						</div>
						<Listbox
							aria-label="Actions"
							style={{
								paddingLeft: 8,
								paddingRight: 22,
							}}
						>
							{susUsers.map((item, index) => {
								return (
									<ListboxItem
										key="new"
										style={{
											backgroundColor: "rgba(0,0,0,0.4)",
											borderBottom: "1px solid rgba(125,125,125,.5)",
											borderRadius: 2,
										}}
									>
										<div className="flex flex-row justify-between items-center">
											<div>{item}</div>
											<div>
												<Button
													size="sm"
													isIconOnly
													color="danger"
													aria-label="Like"
													onClick={() => {
														const removed = susUsers.splice(
															index,
															1
														);
														removeGitHubData(removed[0]);
														setSusUsers([...susUsers]);
													}}
												>
													<FaTrashAlt size={16} />
												</Button>
											</div>
										</div>
									</ListboxItem>
								);
							})}
						</Listbox>
					</div>
				</div>
			</div>
			<div className="flex flex-row justify-end items-center">
				<div
					className=" flex flex-col justify-center items-center"
					style={{ margin: 5 }}
				>
					<Button
						color="primary"
						onPress={() => {
							if (channelName !== "" && username !== "") {
								localStorage.setItem("channelName", channelName);
								localStorage.setItem("username", username);
							}
							setShowErrorMessage(true);
						}}
					>
						Save
					</Button>
				</div>
			</div>
			{openAddModal}
		</>
	);
};
export default Settings;
