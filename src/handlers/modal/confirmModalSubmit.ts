import { ModalSubmitInteraction, InteractionResponseType } from '../../types/discord';
import { getRequest, updateRequestDraft } from '../../services/database';
import { parseCardRequest } from '../../services/openai';
import { fetchAllCardData } from '../../services/scryfall';
import { sanitizeInput } from '../../utils/sanitize';
import { buildConfirmationMessage } from '../../utils/confirmationMessage';
import { formatCardsForModal } from '../../utils/cardFormatter';
import { updateInteractionResponse } from '../../services/discord';

export async function handleConfirmModalSubmit(
  interaction: ModalSubmitInteraction,
  requestId: number
): Promise<any> {
  // Defer update so we have time to re-parse with OpenAI
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  };

  processConfirmModalSubmit(interaction, requestId).catch((error) => {
    console.error('Error processing confirm modal submit:', error);
  });

  return deferredResponse;
}

async function processConfirmModalSubmit(
  interaction: ModalSubmitInteraction,
  requestId: number
): Promise<void> {
  try {
    const request = await getRequest(requestId);
    if (!request) return;

    // Get the new text from the modal
    const actionRow = interaction.data.components[0];
    const textInput = actionRow.components.find((c) => c.custom_id === 'card_list_input');
    const newText = textInput?.value || '';

    const sanitizedInput = sanitizeInput(newText);

    // Update loading state message temporarily
    await updateInteractionResponse(
      interaction.application_id,
      interaction.token,
      '⏳ Re-parsing your card list, please wait...',
      [], []
    );

    // Re-parse with OpenAI
    const parsedCards = await parseCardRequest(sanitizedInput);

    // Re-fetch Scryfall data
    let cardsWithData;
    try {
      cardsWithData = await fetchAllCardData(parsedCards.card_data);
    } catch (error) {
      console.error('Scryfall fetching error during edit:', error);
      cardsWithData = parsedCards.card_data.map((card) => ({
        ...card,
        set: 'no match',
        legalities_standard: '',
        is_over_5_dollars: '',
        cmc: '',
        colors: '',
        primary_type: '',
        rarity: '',
      }));
    }

    // Update the database draft — store sorted, enriched card data
    const existingPayload = request.request_payload as any;
    const newPayload = { ...existingPayload, originalInput: newText };
    const cardsRequested = { user_note: parsedCards.user_note, card_data: cardsWithData };
    await updateRequestDraft(requestId, newPayload, cardsRequested);

    // Rebuild the confirmation message — base edit-disabled check on formatted length
    const modalText = formatCardsForModal(cardsRequested);
    const { content, embeds, components } = buildConfirmationMessage(
      requestId,
      cardsWithData,
      modalText.length
    );

    // Update the ephemeral message with the new list
    await updateInteractionResponse(
      interaction.application_id,
      interaction.token,
      content,
      embeds,
      components
    );
  } catch (error) {
    console.error('Unexpected error in processConfirmModalSubmit:', error);
    try {
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        'An error occurred while updating your card list. Please try again.',
        [], []
      );
    } catch (e) {}
  }
}
