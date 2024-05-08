import {
	Button,
	Input,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
	useDisclosure,
} from "@nextui-org/react";
import { FunctionComponent, useEffect, useState } from "react";
import { IoSettings } from "react-icons/io5";
import { getChannelData } from "../../services/kick";
import Chat from "../Chat/Chat";
import ModActions from "../ModActions/ModActions";
import SubView from "../SubView/SubView";
const Layout: FunctionComponent = () => {
	const { isOpen, onOpen, onOpenChange } = useDisclosure();
	const [channelName, setChannelName] = useState<string>("");
	const [username, setUsername] = useState<string>("");
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [streamTitle, setStreamTitle] = useState<string>("Not live");
	useEffect(() => {
		const channelName = localStorage.getItem("channelName");
		const username = localStorage.getItem("username");
		if (username) setUsername(username);
		if (channelName) setChannelName(channelName);
	}, []);
	useEffect(() => {
		setInterval(() => {
			getChannelData(channelName).then((res) => {
				if (res.data.livestream) {
					setStreamTitle(res.data.livestream.session_title);
				} else {
					setStreamTitle("Not live");
				}
			});
		}, 300000);
	});
	return (
		<div className="flex flex-col justify-start items-start w-full h-full">
			<div className="flex flex-row justify-between items-center w-full h-[5%] mt-2 mb-1">
				<div style={{ paddingLeft: 15 }}>{streamTitle}</div>
				<Button
					size="sm"
					variant="light"
					onPress={() => {
						onOpen();
					}}
				>
					<IoSettings size={22} />
				</Button>
			</div>
			<div className="flex flex-row justify-start items-start w-full h-[93%]">
				<div className="w-[50%] h-full mt-2">
					<Chat />
				</div>
				<div className="h-[97%] w-[25%] ml-2 mt-2 border border-solid border-default-200  p-3">
					<SubView />
				</div>
				<div className="h-[97%] w-[25%] ml-2 mt-2 border border-solid border-default-200  p-3">
					<ModActions />
				</div>
			</div>

			<Modal isOpen={isOpen} onOpenChange={onOpenChange}>
				<ModalContent>
					{(onClose) => (
						<>
							<ModalHeader className="flex flex-col gap-1">
								Configuration
							</ModalHeader>
							<ModalBody>
								{errorMessage !== "" && (
									<div
										style={{ color: "rgb(200,10,50)" }}
										className="flex flex-row justify-center items-center"
									>
										{errorMessage}
									</div>
								)}
								<Input
									size="sm"
									label="Channel Name"
									value={channelName}
									onChange={(val) => {
										setChannelName(val.target.value);
									}}
								/>
								<Input
									size="sm"
									label="Username"
									value={username}
									onChange={(val) => {
										setUsername(val.target.value);
									}}
								/>
							</ModalBody>
							<ModalFooter>
								<Button
									color="danger"
									variant="light"
									onPress={onClose}
								>
									Close
								</Button>
								<Button
									color="primary"
									onPress={() => {
										if (channelName !== "" && username !== "") {
											localStorage.setItem(
												"channelName",
												channelName
											);
											localStorage.setItem("username", username);
											onClose();
										} else {
											setErrorMessage("Fill the all fields..");
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
		</div>
	);
};
export default Layout;
