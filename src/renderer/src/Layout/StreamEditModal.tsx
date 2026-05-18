import {
	Button,
	Modal,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from "@nextui-org/react";
import React, { FunctionComponent, useEffect, useState } from "react";
import { toast } from "react-toastify";
import MessageActionsFunc from "../../store/actions/chatMessage";
import { useFanthalDispatch } from "../../store/hooks/hooks";
import { refreshStreamMeta } from "../../util/chatConnection";
import { StreamCategoryMeta, StreamMeta } from "../../util/streamMeta";
import CategoryAutocomplete from "./CategoryAutocomplete";

interface StreamEditModalProps {
	isOpen: boolean;
	onClose: () => void;
	channelSlug: string;
	meta?: StreamMeta;
}

const StreamEditModal: FunctionComponent<StreamEditModalProps> = ({
	isOpen,
	onClose,
	channelSlug,
	meta,
}) => {
	const dispatch = useFanthalDispatch();
	const [title, setTitle] = useState(meta?.streamTitle || "");
	const [category, setCategory] = useState<StreamCategoryMeta | undefined>(
		meta?.category
	);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (isOpen) {
			setTitle(meta?.streamTitle || "");
			setCategory(meta?.category);
		}
	}, [isOpen, meta?.streamTitle, meta?.category?.id, meta?.category?.name]);

	const trimmedTitle = title.trim();
	const titleChanged = trimmedTitle !== (meta?.streamTitle || "").trim();
	const categoryChanged =
		(category?.id || undefined) !== (meta?.category?.id || undefined);
	const dirty = titleChanged || categoryChanged;
	const titleInvalid = trimmedTitle.length === 0;

	const handleSubmit = async () => {
		if (!dirty || titleInvalid) return;
		setSubmitting(true);
		const request: {
			stream_title?: string;
			category_id?: number;
		} = {};
		if (titleChanged) request.stream_title = trimmedTitle;
		if (categoryChanged && category?.id) request.category_id = category.id;

		try {
			await window.electron.kick.patchChannel(request);
			dispatch(
				MessageActionsFunc.setStreamMeta({
					channelSlug,
					streamTitle: titleChanged ? trimmedTitle : meta?.streamTitle,
					category: categoryChanged ? category : meta?.category,
					updatedAt: Date.now(),
				})
			);
			dispatch(refreshStreamMeta(channelSlug));
			toast("Yayın bilgileri güncellendi.", { type: "success" });
			onClose();
		} catch (err: any) {
			const message: string =
				typeof err?.message === "string" ? err.message : "Güncelleme başarısız.";
			const friendly = message.includes("401")
				? "Kick OAuth `channel:write` izni eksik ya da süresi dolmuş. Yeniden bağlanıp izinleri onayla."
				: message.includes("403")
				? "Kick bu işlem için yetkili değilsiniz dedi. Yalnız kanal sahibi düzenleyebilir."
				: message;
			toast(friendly, { type: "error" });
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={() => {
				if (!submitting) onClose();
			}}
			placement="center"
			backdrop="opaque"
			classNames={{ wrapper: "stream-edit-modal-wrapper" }}
		>
			<ModalContent className="stream-edit-modal">
				<ModalHeader>Yayını düzenle</ModalHeader>
				<ModalBody>
					<label className="stream-edit-label" htmlFor="stream-edit-title">
						Başlık
					</label>
					<input
						id="stream-edit-title"
						type="text"
						className="stream-edit-input"
						value={title}
						maxLength={140}
						onChange={(event) => setTitle(event.target.value)}
						placeholder="Yayın başlığı"
						disabled={submitting}
					/>
					{titleInvalid && (
						<div className="stream-edit-helper stream-edit-helper--error">
							Başlık boş olamaz.
						</div>
					)}

					<label className="stream-edit-label">Kategori</label>
					<CategoryAutocomplete
						initialCategory={category}
						onChange={setCategory}
						disabled={submitting}
					/>
					<div className="stream-edit-helper">
						Aramaya en az 2 karakter yaz; ↑/↓ ile gez, Enter ile seç.
					</div>
				</ModalBody>
				<ModalFooter>
					<Button
						variant="light"
						onPress={() => onClose()}
						isDisabled={submitting}
					>
						Vazgeç
					</Button>
					<Button
						color="primary"
						onPress={handleSubmit}
						isDisabled={!dirty || titleInvalid || submitting}
						isLoading={submitting}
					>
						Kaydet
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

export default StreamEditModal;
