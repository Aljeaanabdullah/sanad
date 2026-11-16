-- Agent RPCs are for agents only (they also check the agent token inside).
revoke execute on function public.agent_hire(integer, text, text, text, text, date) from authenticated;
revoke execute on function public.agent_set_status(integer, text, text) from authenticated;
